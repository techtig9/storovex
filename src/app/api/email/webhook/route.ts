
import {NextRequest} from "next/server";
import {applySecurity,apiSuccess,apiError} from "@/core/security/api";
import {createServerStorageClient} from "@/core/storage/supabaseStorage";
import {shouldSuppress} from "@/core/email/emailEvents";

export async function POST(req:NextRequest){
 const guard=applySecurity(req,["POST"]); if(guard)return guard;
 const body=await req.json();
 const type:string|undefined=body?.type;
 const email:string|undefined=body?.data?.to?.[0]??body?.data?.email;
 if(!type||!email)return apiError(400,"RESEND_WEBHOOK_MALFORMED","Missing event type or recipient");

 const c=createServerStorageClient();
 const status=type.includes("bounced")?"bounced":type.includes("complained")?"complained":type.includes("delivered")?"delivered":"sent";
 await c.from("email_events").insert({recipient:email,type:"webhook_update",status,attempt:1});

 if(status==="bounced"||status==="complained"){
  const {count:bounces}=await c.from("email_events").select("id",{count:"exact",head:true}).eq("recipient",email).eq("status","bounced");
  const {count:complaints}=await c.from("email_events").select("id",{count:"exact",head:true}).eq("recipient",email).eq("status","complained");
  if(shouldSuppress(bounces??0,complaints??0)){
   await c.from("email_suppressions").upsert({email,reason:status});
  }
 }
 return apiSuccess({status});
}
