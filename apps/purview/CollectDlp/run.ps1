param($Request, $TriggerMetadata)

$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'Collect-PurviewDlp.ps1')

function Send-Response {
    param([int] $StatusCode, [object] $Body)
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = $StatusCode
        Headers = @{ 'Content-Type' = 'application/json'; 'Cache-Control' = 'no-store' }
        Body = ConvertTo-Json -InputObject $Body -Depth 8 -Compress
    })
}

$scanId = [guid]::Empty
$tenantId = [guid]::Empty
if (-not [guid]::TryParseExact([string]$Request.Body.scanId, 'D', [ref]$scanId) -or
    -not [guid]::TryParseExact([string]$Request.Body.tenantId, 'D', [ref]$tenantId) -or
    $scanId -eq [guid]::Empty -or $tenantId -eq [guid]::Empty) {
    Send-Response 400 @{ error = 'Valid tenantId and scanId are required.' }
    return
}

try {
    $tenants = Get-RequiredSetting -Name 'PURVIEW_TENANT_DOMAINS' | ConvertFrom-Json -AsHashtable
    $domain = $tenants[$tenantId.ToString()]
    if ([string]::IsNullOrWhiteSpace($domain)) {
        Send-Response 403 @{ error = 'Purview collection is not enabled for this tenant.' }
        return
    }
    $result = Invoke-PurviewDlpCollection -ScanId $scanId -TenantId $tenantId -Organization $domain
    Send-Response 200 $result
} catch {
    Write-Warning "Purview endpoint returned an upstream error: $($_.Exception.GetType().Name)"
    Send-Response 502 @{ status = 'incomplete'; error = 'Purview collection could not complete.'; scanId = $scanId; tenantId = $tenantId }
}
