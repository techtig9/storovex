
import {NextRequest,NextResponse} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {createGenerationRequest} from "@/core/generation/generationService";
import {InsufficientCreditsError} from "@/core/billing/creditLedger";

export async function POST(req:NextRequest){
 const body=await req.json();
 try{
  const membership=await authorizeStoreAction(body.storeId,"ai:generate");
  const result=await createGenerationRequest({
   storeId:body.storeId,projectId:body.projectId,accountId:body.accountId,planId:body.planId,
   userId:membership.user.id,type:body.type,quality:body.quality,count:body.count,idempotencyKey:body.idempotencyKey,
  });
  return NextResponse.json(result,{status:201});
 }catch(e){
  if(e instanceof InsufficientCreditsError)return NextResponse.json({error:"INSUFFICIENT_CREDITS"},{status:402});
  const message=e instanceof Error?e.message:"GENERATION_REQUEST_FAILED";
  const status=message==="FORBIDDEN"||message==="STORE_ACCESS_DENIED"?403:400;
  return NextResponse.json({error:message},{status});
 }
}
