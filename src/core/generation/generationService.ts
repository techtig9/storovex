
import {createServerStorageClient} from "../storage/supabaseStorage";
import {reserveJobCredits,commitJobCredits,refundJobCredits} from "../billing/creditService";
import {estimateCredits,type GenerationType,type Quality} from "./catalog";
import {maxSpendPerJob,type PlanId} from "../billing/plans";
import {validateGenerationOutput,shouldDeadLetter} from "./stageMachine";

export async function createGenerationRequest(input:{
 storeId:string;projectId:string;accountId:string;planId:PlanId;userId:string;
 type:GenerationType;quality:Quality;count:number;idempotencyKey:string;
}){
 const credits=estimateCredits(input.type,input.quality,input.count);
 const jobId=crypto.randomUUID();
 await reserveJobCredits({
  accountId:input.accountId,storeId:input.storeId,planId:input.planId,jobId,
  amount:Math.min(credits,maxSpendPerJob(input.planId)),idempotencyKey:input.idempotencyKey,
 });
 const c=createServerStorageClient();
 const {data,error}=await c.from("ai_generation_requests").insert({
  id:jobId,store_id:input.storeId,project_id:input.projectId,user_id:input.userId,
  type:input.type,quality:input.quality,count:input.count,estimated_credits:credits,
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
 const c=createServerStorageClient();
 const {error}=await c.from("ai_generation_requests").update({stage:"completed",updated_at:new Date().toISOString()}).eq("id",input.jobId);
 if(error)throw new Error(`GENERATION_COMPLETE_FAILED: ${error.message}`);
 return {assetUrls};
}

export async function failGenerationRequest(input:{jobId:string;accountId:string;reservedAmount:number;attempt:number;reason:string}){
 const deadLetter=shouldDeadLetter(input.attempt);
 await refundJobCredits({accountId:input.accountId,jobId:input.jobId,reservedAmount:input.reservedAmount});
 const c=createServerStorageClient();
 const {error}=await c.from("ai_generation_requests").update({
  stage:deadLetter?"failed":"planning",attempt:input.attempt+1,last_error:input.reason,updated_at:new Date().toISOString(),
 }).eq("id",input.jobId);
 if(error)throw new Error(`GENERATION_FAIL_UPDATE_FAILED: ${error.message}`);
 return {deadLetter};
}
