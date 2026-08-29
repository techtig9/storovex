
import {createServerStorageClient} from "../storage/supabaseStorage";
import {assertValidStatus,assertValidSort,canTransitionStatus,duplicateName,sanitizeSearchQuery,type ProjectStatus,type ProjectSortField,type SortDirection} from "./projectRules";

export async function listProjects(input:{storeId:string;search?:string;status?:string;sortField?:string;sortDirection?:string;page?:number;pageSize?:number}){
 const sortField=(input.sortField??"updated_at") as ProjectSortField;
 const sortDirection=(input.sortDirection??"desc") as SortDirection;
 assertValidSort(sortField,sortDirection);
 if(input.status)assertValidStatus(input.status);
 const query=input.search?sanitizeSearchQuery(input.search):undefined;
 const page=Math.max(1,input.page??1);
 const pageSize=Math.min(100,Math.max(1,input.pageSize??20));

 const c=createServerStorageClient();
 let q=c.from("projects").select("*",{count:"exact"}).eq("store_id",input.storeId);
 if(input.status)q=q.eq("status",input.status);
 if(query)q=q.ilike("name",`%${query}%`);
 q=q.order(sortField,{ascending:sortDirection==="asc"}).range((page-1)*pageSize,page*pageSize-1);

 const {data,error,count}=await q;
 if(error)throw new Error(`PROJECT_LIST_FAILED: ${error.message}`);
 return {projects:data??[],total:count??0,page,pageSize};
}

export async function createProject(input:{storeId:string;userId:string;name:string;templateId?:string}){
 const c=createServerStorageClient();
 const {data,error}=await c.from("projects").insert({
  store_id:input.storeId,created_by:input.userId,name:input.name,template_id:input.templateId??null,status:"draft",
 }).select().single();
 if(error)throw new Error(`PROJECT_CREATE_FAILED: ${error.message}`);
 return data;
}

export async function duplicateProject(input:{storeId:string;userId:string;projectId:string}){
 const c=createServerStorageClient();
 const {data:original,error:findErr}=await c.from("projects").select("*").eq("id",input.projectId).eq("store_id",input.storeId).single();
 if(findErr||!original)throw new Error("PROJECT_NOT_FOUND");
 const {data:siblings}=await c.from("projects").select("name").eq("store_id",input.storeId);
 const name=duplicateName(original.name,(siblings??[]).map((s:{name:string})=>s.name));
 const {data,error}=await c.from("projects").insert({
  store_id:input.storeId,created_by:input.userId,name,template_id:original.template_id,status:"draft",
 }).select().single();
 if(error)throw new Error(`PROJECT_DUPLICATE_FAILED: ${error.message}`);
 return data;
}

export async function setProjectStatus(input:{storeId:string;projectId:string;from:ProjectStatus;to:ProjectStatus}){
 if(!canTransitionStatus(input.from,input.to))throw new Error("PROJECT_STATUS_TRANSITION_INVALID");
 const c=createServerStorageClient();
 const {data,error}=await c.from("projects").update({status:input.to,updated_at:new Date().toISOString()})
  .eq("id",input.projectId).eq("store_id",input.storeId).select().single();
 if(error)throw new Error(`PROJECT_STATUS_UPDATE_FAILED: ${error.message}`);
 return data;
}

export async function deleteProject(input:{storeId:string;projectId:string}){
 const c=createServerStorageClient();
 const {error}=await c.from("projects").delete().eq("id",input.projectId).eq("store_id",input.storeId);
 if(error)throw new Error(`PROJECT_DELETE_FAILED: ${error.message}`);
 return {deleted:true};
}
