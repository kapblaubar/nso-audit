import type {AzureRoleHistory,LicenseEvidenceRow} from '../api';
import {sourceRecord} from './AuditPolicyDetails';

export interface AzureFinding {id:string;title:string;detail:string;action:string}

const settings=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const lower=(value:unknown)=>String(value??'').toLowerCase();
const strings=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];
const ipv4=(value:unknown)=>{
  const parts=String(value??'').split('.');
  return parts.length===4&&parts.every(part=>/^\d{1,3}$/.test(part)&&Number(part)<=255)
    ?parts.reduce((result,part)=>result*256+Number(part),0):null;
};
const matchesManagementPort=(value:string)=>{
  if(value==='*')return true;
  if(!/^\d+(?:-\d+)?$/.test(value))return false;
  const [first,last]=value.split('-').map(Number);
  return first!==undefined&&[22,3389].some(port=>first<=port&&(last??first)>=port);
};

export function azureConfigurationFindings(dataset:string,row:LicenseEvidenceRow,previous?:LicenseEvidenceRow):AzureFinding[]{
  const data=sourceRecord(row);
  const findings:AzureFinding[]=[];
  if(dataset==='azureStorageSettings'){
    const network=settings(data.network),access=settings(data.access),sas=settings(data.sasPolicy);
    if(lower(network.publicNetworkAccess)==='enabled'&&lower(network.defaultAction)==='allow')
      findings.push({id:'storage-public',title:'Restrict Storage public network access',
        detail:'Public network access is enabled and the firewall default action is Allow.',
        action:'Review workload connectivity, then limit access to approved networks or private endpoints.'});
    if(access.allowSharedKeyAccess===true)
      findings.push({id:'storage-shared-key',title:'Review Storage Shared Key access',
        detail:'Shared Key authorization is enabled.',
        action:'Identify applications using Shared Key and migrate compatible workloads to Microsoft Entra authentication.'});
    if('sasPolicy' in data&&!sas.sasExpirationPeriod&&!sas.expirationAction)
      findings.push({id:'storage-sas',title:'Review Storage SAS expiration policy',
        detail:'Azure returned no SAS expiration policy in this snapshot.',
        action:'Review whether the account uses SAS and set an appropriate maximum validity interval where applicable.'});
  }
  if(dataset==='azureSqlFirewall'){
    const name=String(data.name??'Firewall rule'),range=String(data.startIpAddress)+' to '+String(data.endIpAddress);
    if(data.allowAzureServices===true)
      findings.push({id:'sql-azure-services',title:'Review SQL access from Azure services',
        detail:name+' ('+range+') is the Allow Azure services rule.',
        action:'Verify which workloads rely on the rule and use narrower network access where possible.'});
    if(previous){
      const old=sourceRecord(previous),oldStart=ipv4(old.startIpAddress),oldEnd=ipv4(old.endIpAddress);
      const start=ipv4(data.startIpAddress),end=ipv4(data.endIpAddress);
      if(old.allowAzureServices!==true&&data.allowAzureServices!==true&&start!==null&&end!==null&&oldStart!==null&&oldEnd!==null&&
        oldStart<=oldEnd&&start<=oldStart&&end>=oldEnd&&(start<oldStart||end>oldEnd))
        findings.push({id:'sql-firewall-widened',title:'Review widened SQL firewall range',
          detail:name+' changed from '+old.startIpAddress+' to '+old.endIpAddress+'; current range '+range+'.',
          action:'Confirm the larger range is required and narrow it to approved source addresses.'});
    }
  }
  if(dataset==='azureSqlAudit'&&lower(data.state)==='disabled')
    findings.push({id:'sql-audit-disabled',title:'Enable SQL server auditing',detail:'Server auditing is explicitly disabled.',
      action:'Enable server auditing to an approved destination and verify event delivery.'});
  if(dataset==='azureNsgSettings'){
    for(const [index,value] of (Array.isArray(data.securityRules)?data.securityRules:[]).entries()){
      const rule=settings(value);
      if(lower(rule.direction)!=='inbound'||lower(rule.access)!=='allow'||!['tcp','*'].includes(lower(rule.protocol)))continue;
      const sources=[String(rule.sourceAddressPrefix??''),...strings(rule.sourceAddressPrefixes)];
      const ports=[String(rule.destinationPortRange??''),...strings(rule.destinationPortRanges)];
      const broadSources=sources.filter(source=>['internet','*','0.0.0.0/0','::/0'].includes(lower(source)));
      const managementPorts=ports.filter(matchesManagementPort);
      if(!broadSources.length||!managementPorts.length)continue;
      const attachments=[...(Array.isArray(data.subnets)?data.subnets:[]),...(Array.isArray(data.networkInterfaces)?data.networkInterfaces:[])]
        .map(item=>settings(item).id).filter(Boolean).join(', ');
      findings.push({id:'nsg-management-'+index,title:'Review broad NSG management access',
        detail:String(rule.name??'Inbound rule')+' (priority '+String(rule.priority??'unknown')+') allows '+broadSources.join(', ')+' to destination ports '+managementPorts.join(', ')+', which include SSH or RDP.'+
          (attachments?' Attachments: '+attachments+'.':''),
        action:'Review public IPs, routing and applicable rules to verify reachability. Restrict management access to approved sources.'});
    }
  }
  return findings;
}

const privilegedRoles:Record<string,string>={
  '8e3af657-a8ff-443c-a75c-2fe8c4bcb635':'Owner',
  'b24988ac-6180-42a0-ab88-20f7382dd24c':'Contributor',
  '18d7d88d-d35e-4fb5-a5c3-7773c20a72d9':'User Access Administrator',
};

export function privilegedGrantFindings(history:AzureRoleHistory|undefined,scanId:string):AzureFinding[]{
  const prior=history?.summary.PriorScanId?.toLowerCase();
  if(history?.summary.Status!=='complete'||!prior)return [];
  const previous=new Set(history.rows.filter(row=>lower(row.ScanId)===prior).map(row=>row.Id));
  return history.rows.flatMap(row=>{
    const role=privilegedRoles[lower(row.RoleId)];
    if(!role||lower(row.ScanId)!==lower(scanId)||previous.has(row.Id))return [];
    return [{id:row.Id,title:'Review new '+role+' assignment',
      detail:(row.PrincipalName??row.PrincipalId)+' received '+role+' at '+row.Scope+'.',
      action:'Confirm the grant was approved and the role and scope match the access the principal needs.'}];
  });
}

const resourceLabels:Record<string,string>={
  'microsoft.compute/virtualmachines':'Virtual Machine',
  'microsoft.web/staticsites':'Static Web App',
  'microsoft.web/serverfarms':'App Service Plan',
  'microsoft.storage/storageaccounts':'Storage Account',
  'microsoft.keyvault/vaults':'Key Vault',
  'microsoft.sql/servers':'SQL Server',
  'microsoft.sql/servers/databases':'SQL Database',
  'microsoft.network/virtualnetworks':'Virtual Network',
  'microsoft.network/networksecuritygroups':'Network Security Group',
  'microsoft.network/publicipaddresses':'Public IP Address',
};

export function azureResourceLabel(type:unknown,kind:unknown){
  const armType=lower(type),kinds=lower(kind).split(',').map(value=>value.trim());
  if(armType==='microsoft.web/sites'||armType==='microsoft.web/sites/slots'){
    const label=kinds.includes('functionapp')?'Function App':kinds.includes('workflowapp')?'Logic App (Standard)':
      kinds.includes('app')?'Web App':'App Service Site';
    return label+(armType.endsWith('/slots')?' Slot':'');
  }
  return resourceLabels[armType]??String(type??'Unknown');
}
