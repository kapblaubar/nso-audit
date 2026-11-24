[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [Parameter(Mandatory)][string] $ResourceGroupName,
    [Parameter(Mandatory)][string] $FunctionAppName
)
$ErrorActionPreference = 'Stop'
$source = Join-Path (Split-Path -Parent $PSScriptRoot) 'apps/purview'
$package = Join-Path ([IO.Path]::GetTempPath()) ('nso-purview-' + [guid]::NewGuid().ToString('N') + '.zip')
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $files = @('host.json', 'profile.ps1', 'requirements.psd1', 'Collect-PurviewDlp.ps1',
        'CollectDlp/function.json', 'CollectDlp/run.ps1', 'Health/function.json', 'Health/run.ps1')
    $archive = [IO.Compression.ZipFile]::Open($package, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, (Join-Path $source $file), $file, [IO.Compression.CompressionLevel]::Fastest) | Out-Null
        }
    } finally { $archive.Dispose() }
    az functionapp deployment source config-zip --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $FunctionAppName --src $package --build-remote false --timeout 300 --output none
    if ($LASTEXITCODE -ne 0) { throw 'Purview collector deployment failed.' }
} finally {
    if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package }
}
