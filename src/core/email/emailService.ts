
import {createServerSupabase} from "@/core/supabase/server";
import {assertTemplateVarsComplete,mustBypassSuppression,type EmailEventType} from "./emailCatalog";

export async function sendTransactionalEmail(input:{to:string;type:EmailEventType;vars:Record<string,unknown>;storeId?:string}){
 assertTemplateVarsComplete(input.type,input.vars);
 const c=createServerSupabase();

 if(!mustBypassSuppression(input.type)){
  const {data:suppressed}=await c.from("email_suppressions").select("email").eq("email",input.to).maybeSingle();
  if(suppressed)throw new Error("EMAIL_RECIPIENT_SUPPRESSED");
 }

 const apiKey=process.env.RESEND_API_KEY;
 if(!apiKey)throw new Error("RESEND_API_KEY_NOT_CONFIGURED");

 const res=await fetch("https://api.resend.com/emails",{
  method:"POST",
  headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
  body:JSON.stringify({from:"Storovex <notifications@storovex.com>",to:input.to,subject:input.type,react:undefined,tags:[{name:"event_type",value:input.type}],...input.vars}),
 });

 const {error:insertErr}=await c.from("email_events").insert({
  recipient:input.to,type:input.type,status:res.ok?"sent":"failed",store_id:input.storeId??null,attempt:1,
 });
 if(insertErr)throw new Error(`EMAIL_EVENT_LOG_FAILED: ${insertErr.message}`);
 if(!res.ok)throw new Error(`EMAIL_SEND_FAILED: ${res.status}`);
 return {sent:true};
}
