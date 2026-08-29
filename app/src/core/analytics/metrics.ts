
function pct(numerator:number,denominator:number){
 return Math.round((numerator/denominator)*10000)/100;
}

// Callers pass each active subscription's amount already normalized to a monthly
// cents figure (annual plans divided by 12) so this stays a plain sum.
export function mrrFromMonthlyAmounts(monthlyAmountsCents:number[]){
 if(monthlyAmountsCents.some(v=>v<0))throw new Error("MRR_INPUT_INVALID");
 return monthlyAmountsCents.reduce((s,v)=>s+v,0);
}

export function arrFromMrr(mrrCents:number){
 if(mrrCents<0)throw new Error("ARR_INPUT_INVALID");
 return mrrCents*12;
}

export function churnRate(canceledCount:number,startingActiveCount:number){
 if(startingActiveCount<0||canceledCount<0||canceledCount>startingActiveCount)throw new Error("CHURN_INPUT_INVALID");
 return startingActiveCount===0?0:pct(canceledCount,startingActiveCount);
}

export function aiCostPerCustomerCents(totalCostCents:number,activeCustomers:number){
 if(totalCostCents<0)throw new Error("AI_COST_INPUT_INVALID");
 if(activeCustomers<=0)throw new Error("AI_COST_INPUT_INVALID");
 return Math.round(totalCostCents/activeCustomers);
}

export function marginPct(revenueCents:number,costCents:number){
 if(revenueCents<=0||costCents<0)throw new Error("MARGIN_INPUT_INVALID");
 return Math.round(((revenueCents-costCents)/revenueCents)*10000)/100;
}

export function timeToFirstValueMs(signupAtMs:number,firstValueAtMs:number){
 if(firstValueAtMs<signupAtMs)throw new Error("TTFV_INPUT_INVALID");
 return firstValueAtMs-signupAtMs;
}
