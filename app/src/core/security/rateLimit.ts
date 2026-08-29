
export type RateLimitResult={allowed:boolean;limit:number;remaining:number;retryAfterSeconds:number};
export function fixedWindow(key:string,limit:number,windowSeconds:number,nowMs=Date.now(),state=new Map<string,{start:number,count:number}>()):RateLimitResult{
 const now=Math.floor(nowMs/1000), cur=state.get(key);
 if(!cur||now-cur.start>=windowSeconds){state.set(key,{start:now,count:1});return {allowed:true,limit,remaining:limit-1,retryAfterSeconds:windowSeconds};}
 if(cur.count>=limit)return {allowed:false,limit,remaining:0,retryAfterSeconds:Math.max(1,windowSeconds-(now-cur.start))};
 cur.count++;return {allowed:true,limit,remaining:limit-cur.count,retryAfterSeconds:Math.max(1,windowSeconds-(now-cur.start))};
}
export function rateHeaders(r:RateLimitResult){return {"X-RateLimit-Limit":String(r.limit),"X-RateLimit-Remaining":String(r.remaining),"Retry-After":String(r.retryAfterSeconds)};}
