
import {createServerSupabase} from "@/core/supabase/server";
import {reserveJobCredits,commitJobCredits,refundJobCredits} from "../billing/creditService";
import {estimateCredits,type GenerationType,type Quality} from "./catalog";
import {maxSpendPerJob,type PlanId} from "../billing/plans";
import {validateGenerationOutput,shouldDeadLetter} from "./stageMachine";

export async function createGenerationRequest(input:{
 storeId:string;projectId:string;accountId:string;planId:PlanId;userId:string;
 type:GenerationType;quality:Quality;count:number;idempotencyKey:string;
}){
 const credits=estimateCredits(input.type,input.quality,input.count);
 // Previously this reserved Math.min(credits, planCap), which silently charged the
 // cap and performed the full job — a request over the plan limit was under-billed
 // rather than rejected. Refuse it instead and let the caller surface the limit.
 const cap=maxSpendPerJob(input.planId);
 if(credits>cap)throw new Error("LEDGER_JOB_SPEND_LIMIT_EXCEEDED");
 const jobId=crypto.randomUUID();
 await reserveJobCredits({
  accountId:input.accountId,storeId:input.storeId,planId:input.planId,jobId,
  amount:credits,idempotencyKey:input.idempotencyKey,
 });
 const c=createServerSupabase();
 const {data,error}=await c.from("ai_generation_requests").insert({
  id:jobId,store_id:input.storeId,project_id:input.projectId,user_id:input.userId,
  type:input.type,quality:input.quality,count:input.count,estimated_credits:credits,reserved_credits:credits,
  stage:"planning",attempt:1,idempotency_key:input.idempotencyKey,
 }).select("id,stage,estimated_credits").single();
 if(error)throw new Error(`GENERATION_REQUEST_CREATE_FAILED: ${error.message}`);
 return data;
}

export async function completeGenerationRequest(input:{
 jobId:string;accountId:string;reservedAmount:number;actualAmount:number;
 output:{assetUrls?:string[];error?:string};
}){
 const assetUrls=validateGenerationOutput(input.output);
 await commitJobCredits({accountId:input.accountId,jobId:input.jobId,reservedAmount:input.reservedAmount,actualAmount:input.actualAmount});
 const c=createServerSupabase();
 const {error}=await c.from("ai_generation_requests").update({stage:"completed",updated_at:new Date().toISOString()}).eq("id",input.jobId);
 if(error)throw new Error(`GENERATION_COMPLETE_FAILED: ${error.message}`);
 return {assetUrls};
}

export async function failGenerationRequest(input:{jobId:string;accountId:string;reservedAmount:number;attempt:number;reason:string}){
 const deadLetter=shouldDeadLetter(input.attempt);
 await refundJobCredits({accountId:input.accountId,jobId:input.jobId,reservedAmount:input.reservedAmount});
 const c=createServerSupabase();
 const {error}=await c.from("ai_generation_requests").update({
  stage:deadLetter?"failed":"planning",attempt:input.attempt+1,last_error:input.reason,updated_at:new Date().toISOString(),
 }).eq("id",input.jobId);
 if(error)throw new Error(`GENERATION_FAIL_UPDATE_FAILED: ${error.message}`);
 return {deadLetter};
}
