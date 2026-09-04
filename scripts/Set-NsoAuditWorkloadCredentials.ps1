#Requires -Version 7.2
#Requires -Modules Az.Accounts, Az.KeyVault

[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter()][string] $SubscriptionId,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $KeyVaultName,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F-]{36}$')][string] $ApplicationClientId,
    [Parameter()][ValidateNotNullOrEmpty()][string] $SecretName = "nso-audit-app-client-secret",
    [Parameter()][ValidateNotNullOrEmpty()][string] $SecretDisplayName = "nso-audit-graph-secret",
    [Parameter()][ValidateRange(1, 24)][int] $SecretValidityMonths = 12,
    [Parameter()][switch] $SkipSecret,
    [Parameter()][switch] $IncludeDlpCertificate,
    [Parameter()][ValidateNotNullOrEmpty()][string] $CertificateName = "nso-audit-dlp-certificate",
    [Parameter()][ValidateNotNullOrEmpty()][string] $CertificateDisplayName = "nso-audit-dlp-certificate",
    [Parameter()][ValidateRange(1, 2)][int] $CertificateValidityYears = 1,
    [Parameter()][switch] $RotateSecret,
    [Parameter()][switch] $RotateCertificate
)

$ErrorActionPreference = "Stop"

function Invoke-AzureCliJson {
    param([Parameter(Mandatory)][string[]] $Arguments)
    $result = & az @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI failed: $($result -join [Environment]::NewLine)"
    }
    if (-not $result) { return $null }
    return ($result -join [Environment]::NewLine) | ConvertFrom-Json
}

function Get-AppCredentials {
    param([Parameter(Mandatory)][string] $ClientId)
    $items = Invoke-AzureCliJson -Arguments @(
        "ad", "app", "credential", "list", "--id", $ClientId,
        "--only-show-errors", "--output", "json"
    )
    return @($items)
}

function Add-AppPasswordToVault {
    param(
        [Parameter(Mandatory)][string] $AppObjectId,
        [Parameter(Mandatory)][string] $ClientId,
        [Parameter(Mandatory)][string] $VaultName,
        [Parameter(Mandatory)][string] $VaultSecretName,
        [Parameter(Mandatory)][string] $DisplayName,
        [Parameter(Mandatory)][int] $ValidityMonths
    )

    $start = [DateTimeOffset]::UtcNow
    $end = $start.AddMonths($ValidityMonths)
    $request = @{
        passwordCredential = @{
            displayName = $DisplayName
            startDateTime = $start.ToString("o")
            endDateTime = $end.ToString("o")
        }
    } | ConvertTo-Json -Depth 4 -Compress

    $created = $null
    $secretText = $null
    try {
        $created = Invoke-AzureCliJson -Arguments @(
            "rest", "--method", "post",
            "--url", "https://graph.microsoft.com/v1.0/applications/$AppObjectId/addPassword",
            "--headers", "Content-Type=application/json",
            "--body", $request,
            "--only-show-errors", "--output", "json"
        )
        $secretText = [string] $created.secretText
        if ([string]::IsNullOrWhiteSpace($secretText) -or -not $created.keyId) {
            throw "Microsoft Graph did not return the new password credential."
        }

        $secureSecret = ConvertTo-SecureString -String $secretText -AsPlainText -Force
        Set-AzKeyVaultSecret `
            -VaultName $VaultName `
            -Name $VaultSecretName `
            -SecretValue $secureSecret `
            -Expires $end.UtcDateTime `
            -Tag @{
                applicationClientId = $ClientId
                entraCredentialId = [string] $created.keyId
                entraDisplayName = $DisplayName
                managedBy = "nso-audit-bootstrap"
            } | Out-Null

        return [pscustomobject]@{
            KeyId = [string] $created.keyId
            Expires = $end
        }
    }
    catch {
        if ($created -and $created.keyId) {
            $removeRequest = @{ keyId = [string] $created.keyId } | ConvertTo-Json -Compress
            try {
                Invoke-AzureCliJson -Arguments @(
                    "rest", "--method", "post",
                    "--url", "https://graph.microsoft.com/v1.0/applications/$AppObjectId/removePassword",
                    "--headers", "Content-Type=application/json",
                    "--body", $removeRequest,
                    "--only-show-errors", "--output", "none"
                ) | Out-Null
            }
            catch {
                Write-Warning "Key Vault storage failed and automatic removal of Entra credential '$($created.keyId)' also failed. Revoke that exact credential manually."
            }
        }
        throw
    }
    finally {
        $secretText = $null
        $secureSecret = $null
        $created = $null
        $request = $null
    }
}

if ($SubscriptionId) {
    Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
    & az account set --subscription $SubscriptionId --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI could not select subscription '$SubscriptionId'." }
}

$context = Get-AzContext
if (-not $context) { throw "No Azure PowerShell context is available. Run Connect-AzAccount first." }

$vault = Get-AzKeyVault -VaultName $KeyVaultName
if (-not $vault) { throw "Key Vault '$KeyVaultName' was not found in the active subscription." }

$application = Invoke-AzureCliJson -Arguments @(
    "ad", "app", "show", "--id", $ApplicationClientId,
    "--only-show-errors", "--output", "json"
)
if (-not $application.id) { throw "App Registration '$ApplicationClientId' was not found." }

if ($SkipSecret -and $RotateSecret) {
    throw "-SkipSecret and -RotateSecret cannot be used together."
}

if ($SkipSecret) {
    Write-Host "Client secret: Check skipped by operator" -ForegroundColor Cyan
}
else {
    $credentials = Get-AppCredentials -ClientId $ApplicationClientId
    $vaultSecret = Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name $SecretName -ErrorAction SilentlyContinue
    $entraSecrets = @($credentials | Where-Object { $_.displayName -eq $SecretDisplayName })
    $createSecret = $RotateSecret -or (-not $vaultSecret -and $entraSecrets.Count -eq 0)

    if (-not $RotateSecret -and (($vaultSecret -and $entraSecrets.Count -eq 0) -or (-not $vaultSecret -and $entraSecrets.Count -gt 0))) {
        throw "Secret state is mismatched between Key Vault and Entra. Use -RotateSecret to create a reconciled credential after reviewing the existing entries."
    }

    if ($createSecret) {
        if ($PSCmdlet.ShouldProcess(
            "$($application.displayName) and Key Vault $KeyVaultName",
            "Create an App Registration secret and store it as $SecretName"
        )) {
            $newSecret = Add-AppPasswordToVault `
                -AppObjectId $application.id `
                -ClientId $ApplicationClientId `
                -VaultName $KeyVaultName `
                -VaultSecretName $SecretName `
                -DisplayName $SecretDisplayName `
                -ValidityMonths $SecretValidityMonths
            Write-Host "Client secret: Present (credential $($newSecret.KeyId), expires $($newSecret.Expires.ToString('u')))" -ForegroundColor Green
        }
    }
    else {
        $secretExpiry = ($entraSecrets | Sort-Object endDateTime -Descending | Select-Object -First 1).endDateTime
        Write-Host "Client secret: Present (expires $secretExpiry)" -ForegroundColor Green
    }
}

if (-not $IncludeDlpCertificate) {
    Write-Host "DLP certificate: Not required" -ForegroundColor Cyan
    return
}

$credentials = Get-AppCredentials -ClientId $ApplicationClientId
$vaultCertificate = Get-AzKeyVaultCertificate -VaultName $KeyVaultName -Name $CertificateName -ErrorAction SilentlyContinue
$entraCertificates = @($credentials | Where-Object { $_.displayName -eq $CertificateDisplayName })
$createCertificate = $RotateCertificate -or (-not $vaultCertificate -and $entraCertificates.Count -eq 0)

if (-not $RotateCertificate -and (($vaultCertificate -and $entraCertificates.Count -eq 0) -or (-not $vaultCertificate -and $entraCertificates.Count -gt 0))) {
    throw "Certificate state is mismatched between Key Vault and Entra. Use -RotateCertificate to create a reconciled credential after reviewing the existing entries."
}

if ($createCertificate) {
    if ($PSCmdlet.ShouldProcess(
        "$($application.displayName) and Key Vault $KeyVaultName",
        "Create the exportable DLP certificate $CertificateName and append its public key to Entra"
    )) {
        $result = & az ad app credential reset `
            --id $ApplicationClientId `
            --display-name $CertificateDisplayName `
            --create-cert `
            --cert $CertificateName `
            --keyvault $KeyVaultName `
            --append `
            --years $CertificateValidityYears `
            --only-show-errors `
            --output none 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Certificate creation failed: $($result -join [Environment]::NewLine)"
        }
        $vaultCertificate = Get-AzKeyVaultCertificate -VaultName $KeyVaultName -Name $CertificateName
        Write-Host "DLP certificate: Present (thumbprint $($vaultCertificate.Thumbprint), expires $($vaultCertificate.Expires.ToString('u')))" -ForegroundColor Green
    }
}
else {
    Write-Host "DLP certificate: Present (thumbprint $($vaultCertificate.Thumbprint), expires $($vaultCertificate.Expires.ToString('u')))" -ForegroundColor Green
}

Write-Host "Credential bootstrap complete. No credential values were written to output." -ForegroundColor Cyan
