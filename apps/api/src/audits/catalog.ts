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
  roleAssignments:{table:'AuditRoleAssignments',label:'Directory role assignments',category:'Identity & Access',path:'/v1.0/roleManagement/directory/roleAssignments?$expand=roleDefinition,principal'},
  deviceConfigurations:{table:'AuditDeviceConfigurations',label:'Device configuration profiles',category:'Device & Endpoint Management',path:'/v1.0/deviceManagement/deviceConfigurations'},
  compliancePolicies:{table:'AuditCompliancePolicies',label:'Device compliance policies',category:'Device & Endpoint Management',path:'/v1.0/deviceManagement/deviceCompliancePolicies'},
  appProtectionPolicies:{table:'AuditAppProtectionPolicies',label:'App protection policies',category:'Device & Endpoint Management',path:'/v1.0/deviceAppManagement/managedAppPolicies'},
  exposureScores:{table:'AuditExposureScores',label:'Exposure Score',category:'Scores',path:'/api/exposureScore',endpoint:true,singleton:true},
  deviceSecureScores:{table:'AuditDeviceSecureScores',label:'Secure Score for Devices',category:'Scores',path:'/api/configurationScore',endpoint:true,singleton:true},
  endpointRecommendations:{table:'AuditEndpointRecommendations',label:'Defender for Endpoint recommendations',category:'Threat Protection & Security Operations',path:'/api/recommendations',endpoint:true},
  secureScores:{table:'AuditMicrosoftSecureScores',label:'Microsoft Secure Score snapshots',category:'Scores',path:'/v1.0/security/secureScores'},
  secureScoreProfiles:{table:'AuditSecureScoreProfiles',label:'Secure Score control profiles',category:'Scores',path:'/v1.0/security/secureScoreControlProfiles'},
  resourceGroups:{table:'AuditResourceGroups',label:'Azure resource groups',category:'Cloud inventory',path:'/resourcegroups?api-version=2021-04-01',arm:true},
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
