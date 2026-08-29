
import {NextRequest} from "next/server";
import {applySecurity,apiSuccess,apiError} from "@/core/security/api";
import {requirePlatformAdmin} from "@/core/admin/platformAuth";
import {applyPlanOverride} from "@/core/admin/adminService";

export async function POST(req:NextRequest){
 const guard=applySecurity(req,["POST"]); if(guard)return guard;
 const body=await req.json();
 try{
  const admin=await requirePlatformAdmin();
  const result=await applyPlanOverride({adminUserId:admin.id,storeId:body.storeId,newPlanId:body.newPlanId,reason:body.reason});
  return apiSuccess(result);
 }catch(e){
  const message=e instanceof Error?e.message:"PLAN_OVERRIDE_FAILED";
  const status=message==="PLATFORM_ADMIN_REQUIRED"?403:message==="PLAN_OVERRIDE_REASON_REQUIRED"?422:400;
  return apiError(status,message,message);
 }
}
