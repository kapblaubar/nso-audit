// Static, reviewed sources and table identifiers. Never accept a URL or SQL table from a request.
export const datasetCatalog = {
  settingsCatalogPolicies:{table:'AuditSettingsCatalogPolicies',label:'Settings catalog policies',category:'Device & Endpoint Management',path:'/beta/deviceManagement/configurationPolicies'},
  settingsCatalogSettings:{table:'AuditSettingsCatalogSettings',label:'Settings catalog settings and definitions',category:'Device & Endpoint Management',path:'/beta/deviceManagement/configurationPolicies',parent:'settingsCatalogPolicies',relationship:'settings',expandDefinitions:true},
  settingsCatalogAssignments:{table:'AuditSettingsCatalogAssignments',label:'Settings catalog assignments',category:'Device & Endpoint Management',path:'/beta/deviceManagement/configurationPolicies',parent:'settingsCatalogPolicies',relationship:'assignments'},
  deviceConfigurationDetails:{table:'AuditDeviceConfigurationDetails',label:'Device configuration settings',category:'Device & Endpoint Management',path:'/v1.0/deviceManagement/deviceConfigurations',parent:'deviceConfigurations',relationship:''},
  deviceConfigurationAssignments:{table:'AuditDeviceConfigurationAssignments',label:'Device configuration assignments',category:'Device & Endpoint Management',path:'/v1.0/deviceManagement/deviceConfigurations',parent:'deviceConfigurations',relationship:'assignments'},
  compliancePolicyDetails:{table:'AuditCompliancePolicyDetails',label:'Compliance policy settings',category:'Device & Endpoint Management',path:'/v1.0/deviceManagement/deviceCompliancePolicies',parent:'compliancePolicies',relationship:''},
  compliancePolicyAssignments:{table:'AuditCompliancePolicyAssignments',label:'Compliance policy assignments',category:'Device & Endpoint Management',path:'/v1.0/deviceManagement/deviceCompliancePolicies',parent:'compliancePolicies',relationship:'assignments'},
  conditionalAccess:{table:'AuditConditionalAccessPolicies',label:'Conditional Access policies',category:'Identity & Access',path:'/v1.0/identity/conditionalAccess/policies'},
  namedLocations:{table:'AuditNamedLocations',label:'Named locations',category:'Identity & Access',path:'/v1.0/identity/conditionalAccess/namedLocations'},
  authenticationMethods:{table:'AuditAuthenticationMethods',label:'Authentication method policies',category:'Identity & Access',path:'/v1.0/policies/authenticationMethodsPolicy',singleton:true},
  registrations:{table:'AuditAuthenticationRegistrations',label:'Authentication registration',category:'Identity & Access',path:'/v1.0/reports/authenticationMethods/userRegistrationDetails'},
  authorizationPolicy:{table:'AuditAuthorizationPolicies',label:'Authorization policy',category:'Identity & Access',path:'/v1.0/policies/authorizationPolicy',singleton:true},
  roleAssignments:{table:'AuditRoleAssignments',label:'Directory role assignments',category:'Identity & Access',path:'/v1.0/roleManagement/directory/roleAssignments?$expand=principal'},
  directoryUsers:{table:'AuditDirectoryUsers',label:'Entra users',category:'Identity & Access',path:'/v1.0/users?$select=id,displayName,userPrincipalName,mail,accountEnabled,userType'},
  directoryGroups:{table:'AuditDirectoryGroups',label:'Entra groups',category:'Identity & Access',path:'/v1.0/groups?$select=id,displayName,mail,groupTypes,securityEnabled,onPremisesSyncEnabled'},
  directoryGroupMembers:{table:'AuditDirectoryGroupMembers',label:'Direct group membership',category:'Identity & Access',path:'/v1.0/groups',parent:'directoryGroups',relationship:'members',select:'id'},
  directoryRoleDefinitions:{table:'AuditDirectoryRoleDefinitions',label:'Entra role definitions',category:'Identity & Access',path:'/v1.0/roleManagement/directory/roleDefinitions?$select=id,displayName,description,isBuiltIn,isPrivileged,templateId'},
  directoryRoleEligibility:{table:'AuditDirectoryRoleEligibility',label:'PIM role eligibility',category:'Identity & Access',path:'/v1.0/roleManagement/directory/roleEligibilityScheduleInstances'},
  deviceConfigurations:{table:'AuditDeviceConfigurations',label:'Device configuration profiles',category:'Device & Endpoint Management',path:'/v1.0/deviceManagement/deviceConfigurations'},
  compliancePolicies:{table:'AuditCompliancePolicies',label:'Device compliance policies',category:'Device & Endpoint Management',path:'/v1.0/deviceManagement/deviceCompliancePolicies'},
  appProtectionPolicies:{table:'AuditAppProtectionPolicies',label:'App protection policies',category:'Device & Endpoint Management',path:'/v1.0/deviceAppManagement/managedAppPolicies'},
  exposureScores:{table:'AuditExposureScores',label:'Exposure Score',category:'Scores',path:'/api/exposureScore',endpoint:true,singleton:true},
  deviceSecureScores:{table:'AuditDeviceSecureScores',label:'Secure Score for Devices',category:'Scores',path:'/api/configurationScore',endpoint:true,singleton:true},
  endpointRecommendations:{table:'AuditEndpointRecommendations',label:'Defender for Endpoint recommendations',category:'Threat Protection & Security Operations',path:'/api/recommendations',endpoint:true},
  secureScores:{table:'AuditMicrosoftSecureScores',label:'Microsoft Secure Score snapshots',category:'Scores',path:'/v1.0/security/secureScores?$top=1',latestOnly:true},
  secureScoreProfiles:{table:'AuditSecureScoreProfiles',label:'Secure Score control profiles',category:'Scores',path:'/v1.0/security/secureScoreControlProfiles?$top=200'},
  azureStorageSettings:{table:'AuditAzureStorageSettings',label:'Azure Storage account settings',category:'Cloud configuration',path:'/providers/Microsoft.Storage/storageAccounts?api-version=2023-05-01',arm:true},
  azureSqlSettings:{table:'AuditAzureSqlSettings',label:'Azure SQL server settings',category:'Cloud configuration',path:'/providers/Microsoft.Sql/servers?api-version=2023-08-01&$expand=administrators/activedirectory',arm:true},
  azureResources:{table:'AuditAzureResources',label:'Azure resources',category:'Cloud inventory',path:'/resources?api-version=2021-04-01',arm:true},
  resourceGroups:{table:'AuditResourceGroups',label:'Azure resource groups',category:'Cloud inventory',path:'/resourcegroups?api-version=2021-04-01',arm:true},
  recoveryVaults:{table:'AuditRecoveryVaults',label:'Recovery Services vaults',category:'Backups',path:'/providers/Microsoft.RecoveryServices/vaults?api-version=2025-08-01',arm:true},
  recoveryVaultDetails:{table:'AuditRecoveryVaultDetails',label:'Recovery Services vault settings',category:'Backups',path:'/providers/Microsoft.RecoveryServices/vaults',arm:true,parent:'recoveryVaults',relationship:'',apiVersion:'2025-08-01',childSingleton:true},
  recoveryBackupPolicies:{table:'AuditRecoveryBackupPolicies',label:'Backup policies',category:'Backups',path:'/providers/Microsoft.RecoveryServices/vaults',arm:true,parent:'recoveryVaults',relationship:'backupPolicies',apiVersion:'2025-08-01'},
  recoveryPolicyDetails:{table:'AuditRecoveryPolicyDetails',label:'Backup policy settings',category:'Backups',path:'/providers/Microsoft.RecoveryServices/vaults',arm:true,parent:'recoveryBackupPolicies',relationship:'',apiVersion:'2025-08-01',childSingleton:true},
  recoveryVaultConfig:{table:'AuditRecoveryVaultConfig',label:'Vault backup configuration',category:'Backups',path:'/providers/Microsoft.RecoveryServices/vaults',arm:true,parent:'recoveryVaults',relationship:'backupconfig/vaultconfig',apiVersion:'2025-08-01',childSingleton:true},
  recoveryVaultStorage:{table:'AuditRecoveryVaultStorage',label:'Vault backup storage',category:'Backups',path:'/providers/Microsoft.RecoveryServices/vaults',arm:true,parent:'recoveryVaults',relationship:'backupstorageconfig/vaultstorageconfig',apiVersion:'2025-08-01',childSingleton:true},
  defenderScores:{table:'AuditDefenderCloudScores',label:'Defender for Cloud scores',category:'Scores',path:'/providers/Microsoft.Security/secureScores?api-version=2020-01-01',arm:true},
  defenderRecommendations:{table:'AuditDefenderRecommendations',label:'Defender for Cloud assessments',category:'Threat Protection & Security Operations',path:'/providers/Microsoft.Security/assessments?api-version=2021-06-01',arm:true},
  defenderMetadata:{table:'AuditDefenderAssessmentMetadata',label:'Defender assessment definitions',category:'Threat Protection & Security Operations',path:'/providers/Microsoft.Security/assessmentMetadata?api-version=2021-06-01',arm:true},
} as const;
export type SnapshotDataType=keyof typeof datasetCatalog;
export type DataType=SnapshotDataType|'licenses'|'licenseAssignments';
export const allDataTypes:DataType[]=[...Object.keys(datasetCatalog) as SnapshotDataType[],'licenses','licenseAssignments'];
export function isSnapshotType(value:string):value is SnapshotDataType{return Object.hasOwn(datasetCatalog,value);}
export function isDataType(value:string):value is DataType{return isSnapshotType(value)||value==='licenses'||value==='licenseAssignments';}
export interface SnapshotRecord {
  sourceId:string;displayName:string|null;state:string|null;sourceCreatedAtUtc:string|null;
  sourceUpdatedAtUtc:string|null;sourceJson:string;collectedAtUtc:string;
  parentSourceId?:string;childSourceId?:string;settingDefinitionId?:string|null;
  targetType?:string|null;groupId?:string|null;filterId?:string|null;filterType?:string|null;
}
