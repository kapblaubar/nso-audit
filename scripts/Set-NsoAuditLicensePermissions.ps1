[CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
param(
  [Parameter(Mandatory)][Guid]$TenantId,
  [Parameter(Mandatory)][Guid]$ApplicationClientId,
  [switch]$GrantConsent
)
$ErrorActionPreference='Stop'
$activeTenant=& az account show --query tenantId -o tsv
if($LASTEXITCODE -ne 0 -or $activeTenant -ne $TenantId.ToString()){throw 'Authenticate to the explicit target tenant first.'}
$application=& az ad app show --id $ApplicationClientId --query '{id:id,requiredResourceAccess:requiredResourceAccess}' -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Could not read the application permission manifest.'}
$graph=& az ad sp show --id '00000003-0000-0000-c000-000000000000' --query '{id:id,appRoles:appRoles}' -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Could not resolve Microsoft Graph roles.'}
$servicePrincipal=& az ad sp show --id $ApplicationClientId --query id -o tsv
if($LASTEXITCODE -ne 0){throw 'Customer service principal is missing.'}
$names=@('LicenseAssignment.Read.All','User.Read.All')
$roles=@($graph.appRoles | Where-Object { $_.value -in $names -and $_.allowedMemberTypes -contains 'Application' })
if($roles.Count -ne 2){throw 'Required read-only Graph roles could not be resolved.'}
$resources=@($application.requiredResourceAccess)
$graphResource=$resources | Where-Object resourceAppId -eq '00000003-0000-0000-c000-000000000000'
if(-not $graphResource){
  $graphResource=[PSCustomObject]@{resourceAppId='00000003-0000-0000-c000-000000000000';resourceAccess=@()}
  $resources+= $graphResource
}
foreach($role in $roles){
  if($graphResource.resourceAccess.id -notcontains $role.id){$graphResource.resourceAccess+= [PSCustomObject]@{id=$role.id;type='Role'}}
}
Write-Host 'Additive license collector permissions (existing requested permissions are preserved):'
$names | ForEach-Object {Write-Host "  $_ (Application, read-only)"}
if($GrantConsent){Write-Host "Tenant-wide consent target: $TenantId; Enterprise Application: $ApplicationClientId"}
if(-not $PSCmdlet.ShouldProcess("$ApplicationClientId in $TenantId",'Add licensing read permissions'+$(if($GrantConsent){' and grant the two application roles'}else{''}))){return}
function Invoke-PermissionWrite([string]$Url,[string]$Method,[object]$Body){
  $bodyPath=Join-Path ([IO.Path]::GetTempPath()) ('nso-license-permissions-'+[Guid]::NewGuid().ToString('N')+'.json')
  try{
    $Body | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $bodyPath -Encoding UTF8
    & az rest --method $Method --url $Url --headers 'Content-Type=application/json' --body "@$bodyPath" --output none
    if($LASTEXITCODE -ne 0){throw 'Permission update failed.'}
  }finally{Remove-Item -LiteralPath $bodyPath -Force -ErrorAction SilentlyContinue}
}
Invoke-PermissionWrite "https://graph.microsoft.com/v1.0/applications/$($application.id)" 'patch' @{requiredResourceAccess=$resources}
if($GrantConsent){
  $assignments=& az rest --method get --url "https://graph.microsoft.com/v1.0/servicePrincipals/$servicePrincipal/appRoleAssignments" --query value -o json | ConvertFrom-Json
  if($LASTEXITCODE -ne 0){throw 'Could not inspect existing consent.'}
  foreach($role in $roles){
    if(-not ($assignments | Where-Object { $_.resourceId -eq $graph.id -and $_.appRoleId -eq $role.id })){
      Invoke-PermissionWrite "https://graph.microsoft.com/v1.0/servicePrincipals/$servicePrincipal/appRoleAssignments" 'post' @{principalId=$servicePrincipal;resourceId=$graph.id;appRoleId=$role.id}
    }
  }
}
Write-Host 'Licensing permission configuration complete.'
