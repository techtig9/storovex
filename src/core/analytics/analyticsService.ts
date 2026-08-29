
import {createServerStorageClient} from "../storage/supabaseStorage";
import {mrrFromMonthlyAmounts,arrFromMrr,churnRate,aiCostPerCustomerCents,marginPct} from "./metrics";
import {PLANS,priceForCycle,type PlanId,type BillingCycle} from "../billing/plans";

export async function getRevenueOverview(){
 const c=createServerStorageClient();
 const {data:activeSubs,error}=await c.from("subscriptions").select("plan_id,billing_cycle").eq("status","active");
 if(error)throw new Error(`REVENUE_OVERVIEW_FAILED: ${error.message}`);

 const monthlyAmounts=(activeSubs??[]).map((s:{plan_id:PlanId;billing_cycle:BillingCycle})=>{
  const total=priceForCycle(s.plan_id,s.billing_cycle);
  return s.billing_cycle==="annual"?Math.round(total/12):total;
 });
 const mrr=mrrFromMonthlyAmounts(monthlyAmounts);
 const arr=arrFromMrr(mrr);

 const since=new Date(Date.now()-30*24*60*60*1000).toISOString();
 const {count:canceled}=await c.from("subscriptions").select("id",{count:"exact",head:true}).eq("status","canceled").gte("updated_at",since);
 const startingActive=(activeSubs?.length??0)+(canceled??0);

 return {mrrCents:mrr,arrCents:arr,activeSubscriptions:activeSubs?.length??0,churnRatePct:churnRate(canceled??0,startingActive)};
}

export async function getAiUsageAndMargin(){
 const c=createServerStorageClient();
 const {count:activeCustomers}=await c.from("subscriptions").select("id",{count:"exact",head:true}).eq("status","active");
 const {data:commits}=await c.from("credit_ledger").select("amount").eq("type","commit");
 // Credits are the internal cost proxy; convert to cents via a configured per-credit cost.
 const centsPerCredit=Number(process.env.CREDIT_COST_CENTS??"4");
 const totalCostCents=(commits??[]).reduce((s:number,r:{amount:number})=>s+r.amount*centsPerCredit,0);
 const revenueCents=(await getRevenueOverview()).mrrCents;

 return {
  activeCustomers:activeCustomers??0,
  totalAiCostCents:totalCostCents,
  aiCostPerCustomerCents:activeCustomers?aiCostPerCustomerCents(totalCostCents,activeCustomers):0,
  marginPct:revenueCents>0?marginPct(revenueCents,totalCostCents):0,
 };
}
