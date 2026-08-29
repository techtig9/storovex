
export type EmailStatus="queued"|"sent"|"delivered"|"bounced"|"complained"|"failed";

const TERMINAL=new Set<EmailStatus>(["delivered","bounced","complained","failed"]);
export function isTerminalStatus(status:EmailStatus){return TERMINAL.has(status)}

// Any spam complaint suppresses immediately; repeated hard bounces suppress too,
// since a single transient bounce is common and shouldn't cut a recipient off.
export function shouldSuppress(bounceCount:number,complaintCount:number){
 if(bounceCount<0||complaintCount<0)throw new Error("SUPPRESSION_INPUT_INVALID");
 if(complaintCount>=1)return true;
 if(bounceCount>=2)return true;
 return false;
}

export const MAX_EMAIL_RETRIES=3;
export function shouldRetrySend(attempt:number,status:EmailStatus){
 if(!Number.isInteger(attempt)||attempt<1)throw new Error("EMAIL_ATTEMPT_INVALID");
 if(status!=="failed")return false;
 return attempt<MAX_EMAIL_RETRIES;
}

export function computeRetryDelayMs(attempt:number){
 if(!Number.isInteger(attempt)||attempt<1)throw new Error("EMAIL_ATTEMPT_INVALID");
 return Math.min(60000,2000*2**(attempt-1));
}
