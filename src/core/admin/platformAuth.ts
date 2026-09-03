
import {createServerSupabase} from "@/core/supabase/server";
import {requireSession} from "../auth/session";

export async function requirePlatformAdmin(){
 const user=await requireSession();
 const c=createServerSupabase();
 const {data,error}=await c.from("platform_admins").select("user_id").eq("user_id",user.id).maybeSingle();
 if(error||!data)throw new Error("PLATFORM_ADMIN_REQUIRED");
 return user;
}
