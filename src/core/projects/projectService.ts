
import {createServerSupabase} from "@/core/supabase/server";
import {assertValidStatus,assertValidSort,canTransitionStatus,duplicateName,sanitizeSearchQuery,escapeLikePattern,type ProjectStatus,type ProjectSortField,type SortDirection} from "./projectRules";

export async function listProjects(input:{storeId:string;search?:string;status?:string;sortField?:string;sortDirection?:string;page?:number;pageSize?:number}){
 const sortField=(input.sortField??"updated_at") as ProjectSortField;
 const sortDirection=(input.sortDirection??"desc") as SortDirection;
 assertValidSort(sortField,sortDirection);
 if(input.status)assertValidStatus(input.status);
 const query=input.search?sanitizeSearchQuery(input.search):undefined;
 const page=Math.max(1,input.page??1);
 const pageSize=Math.min(100,Math.max(1,input.pageSize??20));

 const c=createServerSupabase();
 let q=c.from("projects").select("*",{count:"exact"}).eq("store_id",input.storeId);
 if(input.status)q=q.eq("status",input.status);
 if(query)q=q.ilike("name",`%${escapeLikePattern(query)}%`);
 q=q.order(sortField,{ascending:sortDirection==="asc"}).range((page-1)*pageSize,page*pageSize-1);

 const {data,error,count}=await q;
 if(error)throw new Error(`PROJECT_LIST_FAILED: ${error.message}`);
 return {projects:data??[],total:count??0,page,pageSize};
}

export async function createProject(input:{storeId:string;userId:string;name:string;templateId?:string}){
 const c=createServerSupabase();
 const {data,error}=await c.from("projects").insert({
  store_id:input.storeId,created_by:input.userId,name:input.name,template_id:input.templateId??null,status:"draft",
 }).select().single();
 if(error)throw new Error(`PROJECT_CREATE_FAILED: ${error.message}`);
 return data;
}

export async function duplicateProject(input:{storeId:string;userId:string;projectId:string}){
 const c=createServerSupabase();
 const {data:original,error:findErr}=await c.from("projects").select("*").eq("id",input.projectId).eq("store_id",input.storeId).single();
 if(findErr||!original)throw new Error("PROJECT_NOT_FOUND");
 // Only names that could actually collide, not every project in the store.
 const {data:siblings}=await c.from("projects").select("name").eq("store_id",input.storeId)
  .ilike("name",`${escapeLikePattern(original.name)}%`);
 const name=duplicateName(original.name,(siblings??[]).map((s:{name:string})=>s.name));
 const {data,error}=await c.from("projects").insert({
  store_id:input.storeId,created_by:input.userId,name,template_id:original.template_id,status:"draft",
 }).select().single();
 if(error)throw new Error(`PROJECT_DUPLICATE_FAILED: ${error.message}`);
 return data;
}

// `from` is read from the database rather than accepted from the caller. It used to
// be a request-body field, so a client could claim any current status and walk the
// transition rules around — for example moving an archived project back to draft,
// which canTransitionStatus exists to forbid.
export async function setProjectStatus(input:{storeId:string;projectId:string;to:ProjectStatus}){
 const c=createServerSupabase();
 const {data:current,error:readErr}=await c.from("projects").select("status")
  .eq("id",input.projectId).eq("store_id",input.storeId).maybeSingle();
 if(readErr)throw new Error("PROJECT_STATUS_READ_FAILED");
 if(!current)throw new Error("PROJECT_NOT_FOUND");
 if(!canTransitionStatus(current.status as ProjectStatus,input.to))
  throw new Error("PROJECT_STATUS_TRANSITION_INVALID");
 const {data,error}=await c.from("projects").update({status:input.to})
  .eq("id",input.projectId).eq("store_id",input.storeId).eq("status",current.status)
  .select().single();
 if(error)throw new Error("PROJECT_STATUS_UPDATE_FAILED");
 return data;
}

export async function deleteProject(input:{storeId:string;projectId:string}){
 const c=createServerSupabase();
 const {error}=await c.from("projects").delete().eq("id",input.projectId).eq("store_id",input.storeId);
 if(error)throw new Error(`PROJECT_DELETE_FAILED: ${error.message}`);
 return {deleted:true};
}
