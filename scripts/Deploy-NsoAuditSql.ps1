[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $ParametersFile,
    [Parameter(Mandatory)][string[]] $AllowedIpv4Addresses,
    [switch] $Apply
)
$ErrorActionPreference = 'Stop'
$template = Join-Path $PSScriptRoot '../infra/sql.bicep'
$parametersPath = (Resolve-Path -LiteralPath $ParametersFile).Path
foreach ($address in $AllowedIpv4Addresses) {
    $parsed = $null
    if (-not [Net.IPAddress]::TryParse($address, [ref]$parsed) -or
        $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $address -eq '0.0.0.0') {
        throw "Explicit IPv4 address required: $address"
    }
}
$parameterJsonPath = Join-Path ([IO.Path]::GetTempPath()) ('nso-sql-' + [Guid]::NewGuid() + '.json')
try {
    $compiled = & az bicep build-params --file $parametersPath --stdout | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'SQL parameter compilation failed.' }
    $parameters = $compiled.parametersJson | ConvertFrom-Json
    $parameters.parameters.allowedIpv4Addresses.value = @($AllowedIpv4Addresses | Sort-Object -Unique)
    $parameters | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $parameterJsonPath -Encoding utf8
    $arguments = @('--subscription', $SubscriptionId, '--resource-group', $ResourceGroupName,
        '--template-file', $template, '--parameters', ('@' + $parameterJsonPath),
        '--mode', 'Incremental')
    & az deployment group what-if @arguments
    if ($LASTEXITCODE -ne 0) { throw 'SQL deployment what-if failed.' }
    if ($Apply) {
        & az deployment group create @arguments --name ('nso-sql-' + (Get-Date -Format 'yyyyMMddHHmmss')) `
            --query '{state:properties.provisioningState,outputs:properties.outputs}' -o json
        if ($LASTEXITCODE -ne 0) { throw 'SQL deployment failed.' }
    }
} finally { Remove-Item -LiteralPath $parameterJsonPath -ErrorAction SilentlyContinue }
