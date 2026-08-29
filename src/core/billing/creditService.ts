
import {createServerStorageClient} from "../storage/supabaseStorage";
import {reserveCredits,commitReservation,refundReservation,InsufficientCreditsError} from "./creditLedger";
import {maxSpendPerJob,type PlanId} from "./plans";

export async function reserveJobCredits(input:{accountId:string;storeId:string;planId:PlanId;jobId:string;amount:number;idempotencyKey:string}){
 const c=createServerStorageClient();
 const {data:account,error:accErr}=await c.from("credit_accounts").select("id,balance").eq("id",input.accountId).single();
 if(accErr||!account)throw new Error("CREDIT_ACCOUNT_NOT_FOUND");
 const {data:existing}=await c.from("credit_ledger").select("id").eq("idempotency_key",input.idempotencyKey).maybeSingle();
 if(existing)throw new Error("DUPLICATE_IDEMPOTENCY_KEY");
 const newBalance=reserveCredits(account.balance,input.amount,maxSpendPerJob(input.planId));
 const {error:ledgerErr}=await c.from("credit_ledger").insert({
  account_id:input.accountId,type:"reservation",amount:input.amount,job_id:input.jobId,idempotency_key:input.idempotencyKey,
 });
 if(ledgerErr)throw new Error(`LEDGER_WRITE_FAILED: ${ledgerErr.message}`);
 const {error:updErr}=await c.from("credit_accounts").update({balance:newBalance}).eq("id",input.accountId);
 if(updErr)throw new Error(`CREDIT_BALANCE_UPDATE_FAILED: ${updErr.message}`);
 return {balance:newBalance};
}

export async function commitJobCredits(input:{accountId:string;jobId:string;reservedAmount:number;actualAmount:number}){
 const c=createServerStorageClient();
 const {committed,refunded}=commitReservation(input.reservedAmount,input.actualAmount);
 const {error:commitErr}=await c.from("credit_ledger").insert({account_id:input.accountId,type:"commit",amount:committed,job_id:input.jobId});
 if(commitErr)throw new Error(`LEDGER_COMMIT_FAILED: ${commitErr.message}`);
 if(refunded>0){
  const {error:refundErr}=await c.from("credit_ledger").insert({account_id:input.accountId,type:"refund",amount:refunded,job_id:input.jobId});
  if(refundErr)throw new Error(`LEDGER_REFUND_FAILED: ${refundErr.message}`);
 }
 return {committed,refunded};
}

export async function refundJobCredits(input:{accountId:string;jobId:string;reservedAmount:number}){
 const c=createServerStorageClient();
 const amount=refundReservation(input.reservedAmount);
 const {error}=await c.from("credit_ledger").insert({account_id:input.accountId,type:"refund",amount,job_id:input.jobId});
 if(error)throw new Error(`LEDGER_REFUND_FAILED: ${error.message}`);
 return {refunded:amount};
}

export {InsufficientCreditsError};
