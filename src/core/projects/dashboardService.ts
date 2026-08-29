
import {createServerStorageClient} from "../storage/supabaseStorage";
import {summarizeKpis} from "./dashboardMetrics";
import {includedCredits,type PlanId} from "../billing/plans";

export async function getDashboardKpis(storeId:string){
 const c=createServerStorageClient();
 const [{count:totalUsers},{count:activated},{count:generationsTotal},{count:generationsSucceeded},{data:account},{data:sub}]=await Promise.all([
  c.from("store_members").select("id",{count:"exact",head:true}).eq("store_id",storeId).eq("status","active"),
  c.from("projects").select("id",{count:"exact",head:true}).eq("store_id",storeId).eq("status","active"),
  c.from("ai_generation_requests").select("id",{count:"exact",head:true}).eq("store_id",storeId),
  c.from("ai_generation_requests").select("id",{count:"exact",head:true}).eq("store_id",storeId).eq("stage","completed"),
  c.from("credit_accounts").select("balance").eq("store_id",storeId).maybeSingle(),
  c.from("subscriptions").select("plan_id").eq("store_id",storeId).eq("status","active").maybeSingle(),
 ]);
 const planCredits=sub?.plan_id?includedCredits(sub.plan_id as PlanId):1;
 return summarizeKpis({
  activated:activated??0,
  totalUsers:totalUsers??0,
  generationsSucceeded:generationsSucceeded??0,
  generationsTotal:generationsTotal??0,
  creditBalance:account?.balance??0,
  includedCredits:Math.max(1,planCredits),
 });
}
