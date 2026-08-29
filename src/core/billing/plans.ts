
export type PlanId="starter"|"mid"|"pro";
export type BillingCycle="monthly"|"annual";
export const ANNUAL_DISCOUNT_PCT=20;
export const PLANS:Record<PlanId,{name:string;monthlyCents:number;includedCredits:number;maxSpendPerJobCredits:number}>={
 starter:{name:"Starter",monthlyCents:1700,includedCredits:400,maxSpendPerJobCredits:60},
 mid:{name:"Mid",monthlyCents:3400,includedCredits:1200,maxSpendPerJobCredits:150},
 pro:{name:"Pro",monthlyCents:6900,includedCredits:3000,maxSpendPerJobCredits:400},
};
export function priceForCycle(planId:PlanId,cycle:BillingCycle){
 const base=PLANS[planId].monthlyCents;
 if(cycle==="monthly")return base;
 const annualMonthly=Math.round(base*(100-ANNUAL_DISCOUNT_PCT)/100);
 return annualMonthly*12;
}
export function includedCredits(planId:PlanId){return PLANS[planId].includedCredits}
export function maxSpendPerJob(planId:PlanId){return PLANS[planId].maxSpendPerJobCredits}
