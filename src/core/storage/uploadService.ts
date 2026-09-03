
import {createServerSupabase} from "@/core/supabase/server";
import {storagePath,validateUpload} from "./uploadSecurity";

export async function createUploadRecord(input:{storeId:string;userId:string;fileId:string;name:string;mime:string;size:number}){
 validateUpload(input);
 const path=storagePath(input.storeId,input.userId,input.fileId,input.name);
 const c=createServerSupabase();
 const {data,error}=await c.from("file_assets").insert({
  id:input.fileId,store_id:input.storeId,user_id:input.userId,original_name:input.name,
  mime_type:input.mime,size_bytes:input.size,storage_path:path,status:"pending"
 }).select("id,storage_path,status").single();
 if(error)throw new Error(`UPLOAD_RECORD_FAILED: ${error.message}`);
 return data;
}
export async function markUploadReady(fileId:string,storeId:string){
 const c=createServerSupabase();
 const {data,error}=await c.from("file_assets").update({status:"ready",updated_at:new Date().toISOString()})
 .eq("id",fileId).eq("store_id",storeId).select("id,status").single();
 if(error)throw new Error(`UPLOAD_READY_FAILED: ${error.message}`);
 return data;
}
