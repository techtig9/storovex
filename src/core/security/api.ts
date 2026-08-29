
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";

export const apiJsonSchema=z.object({}).passthrough();

export function securityHeaders(res:NextResponse){
 const h=res.headers;
 h.set("X-Content-Type-Options","nosniff");
 h.set("X-Frame-Options","DENY");
 h.set("Referrer-Policy","strict-origin-when-cross-origin");
 h.set("Permissions-Policy","camera=(), microphone=(), geolocation=()");
 h.set("Cross-Origin-Opener-Policy","same-origin");
 return res;
}
export function apiError(status:number,code:string,message:string,extra:Record<string,unknown>={}){
 return securityHeaders(NextResponse.json({ok:false,error:{code,message,...extra}},{status}));
}
export function apiSuccess(data:unknown,status=200){
 return securityHeaders(NextResponse.json({ok:true,data},{status}));
}
export function methodGuard(req:NextRequest,allowed:string[]){
 if(!allowed.includes(req.method)) return apiError(405,"METHOD_NOT_ALLOWED","HTTP method is not allowed");
 return null;
}
export function requireContentType(req:NextRequest){
 if(["POST","PUT","PATCH"].includes(req.method)){
  const ct=req.headers.get("content-type")||"";
  if(!ct.toLowerCase().includes("application/json")) return apiError(415,"UNSUPPORTED_MEDIA_TYPE","Expected application/json");
 }
 return null;
}
export function validateBody<T>(schema:z.ZodType<T>,body:unknown){
 const parsed=schema.safeParse(body);
 if(!parsed.success) return {ok:false,response:apiError(400,"INVALID_REQUEST","Request validation failed",{issues:parsed.error.issues})} as const;
 return {ok:true,data:parsed.data} as const;
}
export function applySecurity(req:NextRequest,allowed:string[]){
 const method=methodGuard(req,allowed); if(method)return method;
 return requireContentType(req);
}
