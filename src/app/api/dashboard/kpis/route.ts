
import {NextRequest,NextResponse} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {getDashboardKpis} from "@/core/projects/dashboardService";

export async function GET(req:NextRequest){
 const {searchParams}=new URL(req.url);
 const storeId=searchParams.get("storeId")??"";
 try{
  await authorizeStoreAction(storeId,"store:read");
  const kpis=await getDashboardKpis(storeId);
  return NextResponse.json(kpis);
 }catch(e){
  const message=e instanceof Error?e.message:"DASHBOARD_KPIS_FAILED";
  const status=message==="FORBIDDEN"||message==="STORE_ACCESS_DENIED"?403:400;
  return NextResponse.json({error:message},{status});
 }
}
