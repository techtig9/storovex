export type QueueJob={id:string;storeId:string;userId:string;provider?:string;priority:"standard"|"high"|"highest";createdAt:number};
export function priorityWeight(p:QueueJob["priority"]){return p==="highest"?0:p==="high"?1:2;}
export function fairSort(a:QueueJob,b:QueueJob){
 const pw=priorityWeight(a.priority)-priorityWeight(b.priority);
 return pw||a.createdAt-b.createdAt;
}
export function canStart(active:number,limit:number){return active<limit;}
