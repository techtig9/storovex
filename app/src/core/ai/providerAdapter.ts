
export type ProviderErrorClass="rate_limit"|"timeout"|"auth"|"validation"|"provider_outage"|"permanent";

export function classifyProviderError(status:number|undefined,code?:string){
 if(status===429)return "rate_limit" as const;
 if(status===401||status===403)return "auth" as const;
 if(status===408||code==="ETIMEDOUT"||code==="TIMEOUT")return "timeout" as const;
 if(status===400||status===422)return "validation" as const;
 if(status!==undefined&&status>=500)return "provider_outage" as const;
 return "permanent" as const;
}

export function isRetryable(errorClass:ProviderErrorClass){
 return errorClass==="rate_limit"||errorClass==="timeout"||errorClass==="provider_outage";
}

export function computeBackoffMs(attempt:number,baseMs=250,maxMs=8000){
 if(attempt<1)throw new Error("BACKOFF_ATTEMPT_INVALID");
 const exp=Math.min(maxMs,baseMs*2**(attempt-1));
 return exp;
}

export type CircuitState="closed"|"open"|"half_open";
export type Circuit={state:CircuitState;failures:number;openedAt?:number};

export function nextCircuitState(circuit:Circuit,outcome:"success"|"failure",now:number,opts={failureThreshold:5,cooldownMs:30000}):Circuit{
 if(circuit.state==="open"){
  if(circuit.openedAt!==undefined&&now-circuit.openedAt>=opts.cooldownMs)return {state:"half_open",failures:circuit.failures};
  return circuit;
 }
 if(outcome==="success")return {state:"closed",failures:0};
 const failures=circuit.failures+1;
 if(failures>=opts.failureThreshold)return {state:"open",failures,openedAt:now};
 return {state:circuit.state,failures};
}

export function canCall(circuit:Circuit){return circuit.state!=="open"}
