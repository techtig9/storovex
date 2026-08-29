
const SENSITIVE_KEYS=/authorization|cookie|token|api[-_]?key|secret|password|refresh|access/i;
export function redact(value:any):any{
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==="object"){
  const out:any={};
  for(const [k,v] of Object.entries(value)) out[k]=SENSITIVE_KEYS.test(k)?"[REDACTED]":redact(v);
  return out;
 }
 if(typeof value==="string"&&value.length>3000)return value.slice(0,3000)+"…";
 return value;
}
