
export type GenerationStage="planning"|"building"|"generating_assets"|"finalizing"|"completed"|"failed";

const STAGE_ORDER:GenerationStage[]=["planning","building","generating_assets","finalizing","completed"];

export function nextStage(current:GenerationStage):GenerationStage{
 if(current==="failed"||current==="completed")throw new Error("GENERATION_TERMINAL_STATE");
 const idx=STAGE_ORDER.indexOf(current);
 if(idx===-1)throw new Error("GENERATION_STAGE_INVALID");
 return STAGE_ORDER[idx+1];
}

export function canTransition(from:GenerationStage,to:GenerationStage){
 if(from==="completed"||from==="failed")return false;
 if(to==="failed")return true;
 try{return nextStage(from)===to}catch{return false}
}

export const MAX_GENERATION_ATTEMPTS=5;
export function shouldDeadLetter(attempt:number,maxAttempts=MAX_GENERATION_ATTEMPTS){
 if(!Number.isInteger(attempt)||attempt<1)throw new Error("ATTEMPT_INVALID");
 return attempt>=maxAttempts;
}

export function validateGenerationOutput(output:{assetUrls?:string[];error?:string}){
 if(output.error)throw new Error(`GENERATION_PROVIDER_ERROR: ${output.error}`);
 if(!output.assetUrls||output.assetUrls.length===0)throw new Error("GENERATION_OUTPUT_EMPTY");
 return output.assetUrls;
}
