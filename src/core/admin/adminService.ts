
import {createServerSupabase} from "@/core/supabase/server";
import {isDeadLetterQueueUnhealthy,isFeatureEnabled,assertPlanOverrideReasonProvided,type FeatureFlag} from "./adminRules";

export async function getJobsHealth(){
 const since=new Date(Date.now()-24*60*60*1000).toISOString();
 const c=createServerSupabase();
 const [{count:total},{count:deadLettered}]=await Promise.all([
  c.from("ai_generation_requests").select("id",{count:"exact",head:true}).gte("created_at",since),
  c.from("ai_generation_requests").select("id",{count:"exact",head:true}).eq("stage","failed").gte("created_at",since),
 ]);
 return {totalJobsLast24h:total??0,deadLetterCount:deadLettered??0,unhealthy:isDeadLetterQueueUnhealthy(deadLettered??0,total??0)};
}

export async function evaluateFeatureFlag(key:string,bucketValue:number){
 const c=createServerSupabase();
 const {data,error}=await c.from("feature_flags").select("enabled,rollout_pct").eq("key",key).maybeSingle();
 if(error||!data)return false;
 const flag:FeatureFlag={enabled:data.enabled,rolloutPct:data.rollout_pct??undefined};
 return isFeatureEnabled(flag,bucketValue);
}

export async function applyPlanOverride(input:{adminUserId:string;storeId:string;newPlanId:string;reason:string}){
 assertPlanOverrideReasonProvided(input.reason);
 const c=createServerSupabase();
 const {error:updErr}=await c.from("subscriptions").update({plan_id:input.newPlanId}).eq("store_id",input.storeId).eq("status","active");
 if(updErr)throw new Error(`PLAN_OVERRIDE_FAILED: ${updErr.message}`);
 const {error:auditErr}=await c.from("admin_audit_events").insert({
  admin_user_id:input.adminUserId,store_id:input.storeId,action:"plan_override",reason:input.reason,metadata:{newPlanId:input.newPlanId},
 });
 if(auditErr)throw new Error(`PLAN_OVERRIDE_AUDIT_FAILED: ${auditErr.message}`);
 return {applied:true};
}
