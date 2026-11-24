param($QueueMessage, $TriggerMetadata)

$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'Collect-PurviewDlp.ps1')

$scanId = $null
$tenantId = $null
$organization = $null

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

    $result = Invoke-PurviewDlpCollection -ScanId $scanId -TenantId $tenantId -Organization $organization
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
Push-OutputBinding -Name PurviewResult -Value ($result | ConvertTo-Json -Depth 8 -Compress)
