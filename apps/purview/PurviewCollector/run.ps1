using namespace System.Security.Cryptography.X509Certificates

param($QueueMessage, $TriggerMetadata)

$ErrorActionPreference = 'Stop'

function Get-RequiredSetting {
    param([Parameter(Mandatory)][string] $Name)

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Required setting '$Name' is missing."
    }

    return $value
}

function Get-ManagedIdentityToken {
    param(
        [Parameter(Mandatory)][string] $Resource,
        [Parameter(Mandatory)][string] $ClientId
    )

    $endpoint = Get-RequiredSetting -Name 'IDENTITY_ENDPOINT'
    $identityHeader = Get-RequiredSetting -Name 'IDENTITY_HEADER'
    $query = 'api-version=2019-08-01&resource={0}&client_id={1}' -f `
        [Uri]::EscapeDataString($Resource), [Uri]::EscapeDataString($ClientId)
    $response = Invoke-RestMethod `
        -Method Get `
        -Uri "$endpoint`?$query" `
        -Headers @{ 'X-IDENTITY-HEADER' = $identityHeader }

    if ([string]::IsNullOrWhiteSpace($response.access_token)) {
        throw 'Managed identity did not return an access token.'
    }

    return $response.access_token
}

function Get-KeyVaultCertificate {
    param(
        [Parameter(Mandatory)][string] $VaultUri,
        [Parameter(Mandatory)][string] $CertificateName,
        [Parameter(Mandatory)][string] $ManagedIdentityClientId
    )

    $token = Get-ManagedIdentityToken `
        -Resource 'https://vault.azure.net' `
        -ClientId $ManagedIdentityClientId
    $vaultBaseUri = $VaultUri.TrimEnd('/') + '/'
    $secretUri = '{0}secrets/{1}?api-version=7.4' -f `
        $vaultBaseUri, [Uri]::EscapeDataString($CertificateName)
    $secret = Invoke-RestMethod `
        -Method Get `
        -Uri $secretUri `
        -Headers @{ Authorization = "Bearer $token" }

    if ([string]::IsNullOrWhiteSpace($secret.value)) {
        throw 'The Key Vault certificate backing secret is empty or inaccessible.'
    }

    $bytes = [Convert]::FromBase64String($secret.value)
    return [X509Certificate2]::new(
        $bytes,
        [string]::Empty,
        [X509KeyStorageFlags]::EphemeralKeySet
    )
}

function Get-PropertyValue {
    param(
        [Parameter(Mandatory)] $Object,
        [Parameter(Mandatory)][string] $Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $null
    }

    return $property.Value
}

function Get-ValueCount {
    param($Value)

    if ($null -eq $Value) { return 0 }
    if ($Value -is [string]) {
        if ([string]::IsNullOrWhiteSpace($Value)) { return 0 }
        return 1
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        return @($Value).Count
    }
    return 1
}

function ConvertTo-SafePolicy {
    param([Parameter(Mandatory)] $Policy)

    [ordered]@{
        id = [string](Get-PropertyValue $Policy 'Guid')
        name = [string](Get-PropertyValue $Policy 'Name')
        mode = [string](Get-PropertyValue $Policy 'Mode')
        workload = [string](Get-PropertyValue $Policy 'Workload')
        enabled = Get-PropertyValue $Policy 'Enabled'
        distributionStatus = [string](Get-PropertyValue $Policy 'DistributionStatus')
        exchangeLocationCount = Get-ValueCount (Get-PropertyValue $Policy 'ExchangeLocation')
        sharePointLocationCount = Get-ValueCount (Get-PropertyValue $Policy 'SharePointLocation')
        oneDriveLocationCount = Get-ValueCount (Get-PropertyValue $Policy 'OneDriveLocation')
        teamsLocationCount = Get-ValueCount (Get-PropertyValue $Policy 'TeamsLocation')
        endpointLocationCount = Get-ValueCount (Get-PropertyValue $Policy 'EndpointDlpLocation')
    }
}

function ConvertTo-SafeRule {
    param([Parameter(Mandatory)] $Rule)

    # Deliberately retain posture metadata only. Conditions, matched content,
    # identities, notification recipients, and incident payloads are excluded.
    [ordered]@{
        id = [string](Get-PropertyValue $Rule 'Guid')
        name = [string](Get-PropertyValue $Rule 'Name')
        policy = [string](Get-PropertyValue $Rule 'ParentPolicyName')
        mode = [string](Get-PropertyValue $Rule 'Mode')
        priority = Get-PropertyValue $Rule 'Priority'
        disabled = Get-PropertyValue $Rule 'Disabled'
        hasSensitiveInformationCondition = $null -ne (Get-PropertyValue $Rule 'ContentContainsSensitiveInformation')
        hasUserNotification = $null -ne (Get-PropertyValue $Rule 'NotifyUser')
        hasIncidentReport = $null -ne (Get-PropertyValue $Rule 'GenerateIncidentReport')
        hasOverride = $null -ne (Get-PropertyValue $Rule 'UserOverrideOptions')
        hasBlockAction = $null -ne (Get-PropertyValue $Rule 'BlockAccess')
    }
}

$scanId = $null
$tenantId = $null
$organization = $null
$certificate = $null
$connected = $false

try {
    $job = if ($QueueMessage -is [string]) {
        $QueueMessage | ConvertFrom-Json
    } else {
        $QueueMessage
    }

    $scanId = [string]$job.scanId
    $tenantId = [string]$job.tenantId
    $organization = [string]$job.organization

    if ($scanId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'The job scanId is invalid.' }
    if ($tenantId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'The job tenantId is invalid.' }
    if ($organization -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]{1,251}[A-Za-z0-9]$') {
        throw 'The job organization must be a verified tenant domain.'
    }

    $clientId = Get-RequiredSetting -Name 'ENTRA_CLIENT_ID'
    $managedIdentityClientId = Get-RequiredSetting -Name 'AZURE_CLIENT_ID'
    $vaultUri = Get-RequiredSetting -Name 'KEY_VAULT_URI'
    $certificateName = Get-RequiredSetting -Name 'ENTRA_CLIENT_CERTIFICATE_NAME'

    $certificate = Get-KeyVaultCertificate `
        -VaultUri $vaultUri `
        -CertificateName $certificateName `
        -ManagedIdentityClientId $managedIdentityClientId

    Import-Module ExchangeOnlineManagement -RequiredVersion 3.9.2
    Connect-IPPSSession `
        -Certificate $certificate `
        -AppId $clientId `
        -Organization $organization `
        -ShowBanner:$false
    $connected = $true

    $policies = @(Get-DlpCompliancePolicy -ErrorAction Stop)
    $rules = @(Get-DlpComplianceRule -ErrorAction Stop)

    $result = [ordered]@{
        schemaVersion = 'purview-evidence-v1'
        module = 'dlp'
        scanId = $scanId
        tenantId = $tenantId
        organization = $organization
        status = 'complete'
        collectedAt = [DateTimeOffset]::UtcNow.ToString('o')
        evidence = [ordered]@{
            policyCount = $policies.Count
            ruleCount = $rules.Count
            policies = @($policies | ForEach-Object { ConvertTo-SafePolicy $_ })
            rules = @($rules | ForEach-Object { ConvertTo-SafeRule $_ })
        }
    }
}
catch {
    Write-Warning "Purview collection failed for scan '$scanId': $($_.Exception.GetType().Name)"
    $dequeueCount = if ($null -ne $TriggerMetadata.DequeueCount) {
        [int]$TriggerMetadata.DequeueCount
    } else {
        1
    }
    if ($dequeueCount -lt 5) {
        throw
    }
    $result = [ordered]@{
        schemaVersion = 'purview-evidence-v1'
        module = 'dlp'
        scanId = $scanId
        tenantId = $tenantId
        organization = $organization
        status = 'incomplete'
        collectedAt = [DateTimeOffset]::UtcNow.ToString('o')
        errorCode = $_.Exception.GetType().Name
        evidence = $null
    }
}
finally {
    if ($connected) {
        Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
    }
    if ($null -ne $certificate) {
        $certificate.Dispose()
    }
}

Push-OutputBinding -Name PurviewResult -Value ($result | ConvertTo-Json -Depth 8 -Compress)
