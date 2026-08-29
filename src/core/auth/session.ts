
import {createServerStorageClient} from "@/core/storage/supabaseStorage";
export async function requireSession(){
 const c=createServerStorageClient();
 const {data,error}=await c.auth.getUser();
 if(error||!data.user)throw new Error("UNAUTHENTICATED");
 return data.user;
}
export async function requireStoreMembership(storeId:string){
 const user=await requireSession();
 const c=createServerStorageClient();
 const {data,error}=await c.from("store_members").select("store_id,role,status")
  .eq("store_id",storeId).eq("user_id",user.id).maybeSingle();
 if(error||!data||data.status!=="active")throw new Error("STORE_ACCESS_DENIED");
 return {user,storeId,role:data.role};
}
