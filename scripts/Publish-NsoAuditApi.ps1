[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [Parameter(Mandatory)][string] $SubscriptionId,
    [string] $ResourceGroupName = 'NSO-Audit',
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9-]{2,60}$')][string] $FunctionAppName,
    [string] $PackageOutputPath
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$apiPath = Join-Path $repositoryRoot 'apps/api'
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$packageRoot = Join-Path $temporaryRoot ('nso-audit-release-' + [Guid]::NewGuid().ToString('N'))
$packagePath = Join-Path $packageRoot 'package'
$zipPath = Join-Path $packageRoot 'api.zip'
New-Item -ItemType Directory -Path $packagePath -Force | Out-Null
try {
    & az functionapp show --subscription $SubscriptionId --resource-group $ResourceGroupName `
        --name $FunctionAppName --query name -o tsv
    if ($LASTEXITCODE -ne 0) { throw 'Target Function not found or not authorized.' }
    Push-Location $repositoryRoot
    try {
        & npm run build --workspace '@nso-audit/api'
        if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
    } finally { Pop-Location }
    Copy-Item -LiteralPath (Join-Path $apiPath 'host.json') -Destination $packagePath
    Copy-Item -LiteralPath (Join-Path $apiPath 'package.json') -Destination $packagePath
    Copy-Item -LiteralPath (Join-Path $apiPath 'dist') -Destination $packagePath -Recurse
    Push-Location $packagePath
    try {
        & npm install --omit=dev --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
    } finally { Pop-Location }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    # Windows PowerShell/.NET Framework can emit backslashes with CreateFromDirectory.
    # Linux Function packages require portable forward-slash entry names.
    $archive=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach($file in [IO.Directory]::EnumerateFiles($packagePath,'*',[IO.SearchOption]::AllDirectories)) {
            $entryName=$file.Substring($packagePath.Length+1).Replace('\','/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file,$entryName,[IO.Compression.CompressionLevel]::Fastest) | Out-Null
        }
    } finally { $archive.Dispose() }
    $inspection=[IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        if(-not $inspection.GetEntry('dist/src/functions/health.js') -or
           -not $inspection.GetEntry('host.json') -or
           @($inspection.Entries | Where-Object { $_.FullName.Contains('\') }).Count -gt 0) {
            throw 'Release archive does not have portable Function paths.'
        }
    } finally { $inspection.Dispose() }
    if ($PackageOutputPath) {
        $outputPath = [IO.Path]::GetFullPath($PackageOutputPath)
        New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null
        Copy-Item -LiteralPath $zipPath -Destination $outputPath
        Write-Host "Release package retained at $outputPath"
    }
    if ($PSCmdlet.ShouldProcess("$FunctionAppName in $ResourceGroupName", 'Deploy API package')) {
        & az functionapp deployment source config-zip --subscription $SubscriptionId --resource-group $ResourceGroupName `
            --name $FunctionAppName --src $zipPath --build-remote false --timeout 300 --output none
        if ($LASTEXITCODE -ne 0) { throw 'API deployment failed.' }
        Write-Host 'API package deployed.'
    }
} finally {
    # Verify the freshly allocated target stays within the temporary directory before recursion.
    $resolved = [IO.Path]::GetFullPath($packageRoot)
    $expectedPrefix = $temporaryRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($expectedPrefix,[StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $resolved) -notmatch '^nso-audit-release-[0-9a-f]{32}$') {
        throw 'Refusing cleanup outside the allocated release directory.'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
}
