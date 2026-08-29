
import {createServerStorageClient} from "../storage/supabaseStorage";

export type QueuedJob={
 id:string;store_id:string|null;user_id:string|null;job_type:string;payload:Record<string,unknown>;
 priority:"standard"|"high"|"highest";status:string;attempts:number;max_attempts:number;
};

export async function claimNextJob(workerId:string):Promise<QueuedJob|null>{
 const c=createServerStorageClient();

 const {data:acquired,error:slotErr}=await c.rpc("try_acquire_worker_slot",{p_worker_id:workerId});
 if(slotErr)throw new Error(`WORKER_SLOT_ACQUIRE_FAILED: ${slotErr.message}`);
 if(!acquired)return null;

 const {data:job,error:claimErr}=await c.rpc("claim_next_job",{p_worker_id:workerId});
 if(claimErr){
  await c.rpc("release_worker_slot",{p_worker_id:workerId});
  throw new Error(`JOB_CLAIM_FAILED: ${claimErr.message}`);
 }
 if(!job){
  await c.rpc("release_worker_slot",{p_worker_id:workerId});
  return null;
 }
 return job as QueuedJob;
}

export async function finishJob(jobId:string,workerId:string){
 const c=createServerStorageClient();
 const {error}=await c.from("job_queue").update({status:"done",updated_at:new Date().toISOString()}).eq("id",jobId);
 await c.rpc("release_worker_slot",{p_worker_id:workerId});
 if(error)throw new Error(`JOB_FINISH_FAILED: ${error.message}`);
 return {finished:true};
}

export async function failJob(jobId:string,workerId:string,reason:string){
 const c=createServerStorageClient();
 const {data:job}=await c.from("job_queue").select("attempts,max_attempts").eq("id",jobId).single();
 const deadLetter=!job||job.attempts>=job.max_attempts;
 const {error}=await c.from("job_queue").update({
  status:deadLetter?"dead_letter":"queued",
  run_after:deadLetter?undefined:new Date(Date.now()+Math.min(60000,2000*2**(job?.attempts??1))).toISOString(),
  locked_at:null,locked_by:null,error_message:reason,updated_at:new Date().toISOString(),
 }).eq("id",jobId);
 await c.rpc("release_worker_slot",{p_worker_id:workerId});
 if(error)throw new Error(`JOB_FAIL_UPDATE_FAILED: ${error.message}`);
 return {deadLetter};
}
