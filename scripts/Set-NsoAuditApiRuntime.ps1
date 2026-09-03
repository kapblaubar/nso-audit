[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [Parameter()]
    [string] $SubscriptionId,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $ResourceGroupName = "NSO-Audit",

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-zA-Z0-9-]{2,60}$')]
    [string] $FunctionAppName,

    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9a-fA-F-]{36}$')]
    [string] $ApplicationClientId,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $ApplicationClientSecretName = "nso-audit-app-client-secret",

    [Parameter(Mandatory)]
    [ValidatePattern('^https://[^/]+$')]
    [string] $FrontendOrigin
)

$ErrorActionPreference = "Stop"

if ($SubscriptionId) {
    Set-AzContext -SubscriptionId $SubscriptionId | Out-Null
    az account set --subscription $SubscriptionId
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI could not select subscription '$SubscriptionId'." }
}

$functionApp = Get-AzWebApp -ResourceGroupName $ResourceGroupName -Name $FunctionAppName -ErrorAction Stop

if ($PSCmdlet.ShouldProcess($FunctionAppName, "Set Entra client ID and allow the frontend CORS origin")) {
    az functionapp config appsettings set `
        --resource-group $ResourceGroupName `
        --name $FunctionAppName `
        --settings `
            "ENTRA_CLIENT_ID=$ApplicationClientId" `
            "ENTRA_CLIENT_SECRET_NAME=$ApplicationClientSecretName" `
        --output none
    if ($LASTEXITCODE -ne 0) { throw "Function App setting update failed." }

    $originsJson = az functionapp cors show `
        --resource-group $ResourceGroupName `
        --name $FunctionAppName `
        --output json
    if ($LASTEXITCODE -ne 0) { throw "Function App CORS configuration could not be read." }
    $origins = @((($originsJson | ConvertFrom-Json).allowedOrigins) | Where-Object { $_ })

    if ($origins -notcontains $FrontendOrigin) {
        az functionapp cors add `
            --resource-group $ResourceGroupName `
            --name $FunctionAppName `
            --allowed-origins $FrontendOrigin `
            --output none
        if ($LASTEXITCODE -ne 0) { throw "Function App CORS update failed." }
    }

    Write-Host "Configured API runtime and allowed origin: $FrontendOrigin" -ForegroundColor Green
}
