import {createContext,useContext} from 'react';
import {portalRoleLabel} from '../portalRoles';

export interface PortalWorkspace {organizationId:string;name:string;tenantId:string}
export interface WorkspaceSelection {
  workspaces:PortalWorkspace[];
  active:PortalWorkspace|undefined;
  select:(workspace:PortalWorkspace)=>void;
}
export const WorkspaceSelectionContext=createContext<WorkspaceSelection|undefined>(undefined);

export function PortalWorkspaceSelectors(){
  const selection=useContext(WorkspaceSelectionContext);
  if(!selection||selection.workspaces.length===0)return null;
  const {workspaces,active,select}=selection;
  const clients=new Map(workspaces.map(item=>[item.organizationId,item.name]));
  const tenants=workspaces.filter(item=>item.organizationId===active?.organizationId);
  return <div className="portal-workspace-selectors">
    <label>Client<select value={active?.organizationId??''} onChange={event=>{
      const workspace=workspaces.find(item=>item.organizationId===event.target.value);
      if(workspace)select(workspace);
    }}>
      {!active&&<option value="">Choose a client</option>}
      {[...clients].map(([id,name])=><option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>Tenant<select value={active?.tenantId??''} disabled={!active} onChange={event=>{
      const workspace=tenants.find(item=>item.tenantId===event.target.value);
      if(workspace)select(workspace);
    }}>
      {!active&&<option value="">Choose a tenant</option>}
      {tenants.map(item=><option key={item.tenantId} value={item.tenantId}>{item.tenantId}</option>)}
    </select></label>
  </div>;
}

export function PortalAccountHeader({username,role}:{username:string;role?:string}){
  return <div className="portal-account" role="group" aria-label="Signed-in account">
    <strong>{username}</strong>
    {role&&<span>{portalRoleLabel(role)}</span>}
  </div>;
}
