[CmdletBinding()]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-zA-Z0-9-]{2,60}$')]
    [string] $FunctionAppName
)

$ErrorActionPreference = "Stop"

if ($SubscriptionId) {
    Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
}

$context = Get-AzContext
if (-not $context) {
    throw "No Azure context is available. Open an authenticated Azure Cloud Shell session."
}

$requestBody = @{
    name = $FunctionAppName
    type = "Microsoft.Web/sites"
} | ConvertTo-Json -Compress

$result = Invoke-AzRestMethod `
    -Method POST `
    -Path "/subscriptions/$($context.Subscription.Id)/providers/Microsoft.Web/checknameavailability?api-version=2024-04-01" `
    -Payload $requestBody

if ($result.StatusCode -notin 200, 201) {
    throw "Name availability request failed with HTTP status $($result.StatusCode)."
}

$availability = $result.Content | ConvertFrom-Json
[pscustomobject]@{
    FunctionAppName = $FunctionAppName
    Available       = $availability.nameAvailable
    Reason          = $availability.reason
    Message         = $availability.message
} | Format-Table -AutoSize

