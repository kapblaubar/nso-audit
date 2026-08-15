[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $ManagedIdentityName,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F-]{36}$')][string] $ApplicationClientId,
    [Parameter()][string] $CredentialName = "nso-audit-function-identity"
)

$ErrorActionPreference = "Stop"
$identity = Get-AzUserAssignedIdentity -ResourceGroupName $ResourceGroupName -Name $ManagedIdentityName
$tenantId = (Get-AzContext).Tenant.Id
$application = az ad app show --id $ApplicationClientId --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $application) { throw "App Registration was not found." }

$existing = az ad app federated-credential list --id $application.id --output json | ConvertFrom-Json |
    Where-Object name -eq $CredentialName
if ($existing) {
    Write-Host "Federated credential already exists: $CredentialName" -ForegroundColor Yellow
    return
}

$parameters = @{
    name = $CredentialName
    issuer = "https://login.microsoftonline.com/$tenantId/v2.0"
    subject = $identity.PrincipalId
    description = "Allows the NSO Audit Function managed identity to act as the multitenant audit application without secrets."
    audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress

if ($PSCmdlet.ShouldProcess($application.displayName, "Trust managed identity $ManagedIdentityName as a federated credential")) {
    $temporaryFile = New-TemporaryFile
    try {
        Set-Content -Path $temporaryFile -Value $parameters -NoNewline
        az ad app federated-credential create --id $application.id --parameters $temporaryFile --output none
        if ($LASTEXITCODE -ne 0) { throw "Federated credential creation failed." }
    } finally { Remove-Item $temporaryFile -Force -ErrorAction SilentlyContinue }
    Write-Host "Configured secretless workload federation: $CredentialName" -ForegroundColor Green
}
