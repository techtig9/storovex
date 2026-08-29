
import {NextRequest} from "next/server";
import {applySecurity,apiSuccess,apiError} from "@/core/security/api";
import {requirePlatformAdmin} from "@/core/admin/platformAuth";
import {getRevenueOverview,getAiUsageAndMargin} from "@/core/analytics/analyticsService";
import {getJobsHealth} from "@/core/admin/adminService";

export async function GET(req:NextRequest){
 const guard=applySecurity(req,["GET"]); if(guard)return guard;
 try{
  await requirePlatformAdmin();
  const [revenue,aiUsage,jobs]=await Promise.all([getRevenueOverview(),getAiUsageAndMargin(),getJobsHealth()]);
  return apiSuccess({revenue,aiUsage,jobs});
 }catch(e){
  const message=e instanceof Error?e.message:"ADMIN_OVERVIEW_FAILED";
  return apiError(message==="PLATFORM_ADMIN_REQUIRED"?403:400,message,message);
 }
}
