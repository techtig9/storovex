
import {fixedWindow,rateHeaders} from "./rateLimit";
export function guardRequest(input:{key:string;limit:number;windowSeconds:number;state?:Map<string,{start:number,count:number}>}){
 const result=fixedWindow(input.key,input.limit,input.windowSeconds,Date.now(),input.state);
 return {result,headers:rateHeaders(result)};
}
