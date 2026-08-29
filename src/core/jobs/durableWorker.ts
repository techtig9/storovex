import {claimNextJob,finishJob,failJob} from "./worker";
export async function runDurableWorker(workerId:string,handler:(job:any)=>Promise<void>,opts={pollMs:1000,heartbeatMs:5000}){
 let stopped=false; const stop=()=>{stopped=true};
 while(!stopped){ const job=await claimNextJob(workerId); if(!job){await new Promise(r=>setTimeout(r,opts.pollMs));continue;}
  try{await handler(job);await finishJob(job.id,workerId);}catch(e){await failJob(job.id,workerId,e instanceof Error?e.message:"worker_failed");}
 }
 return stop;
}