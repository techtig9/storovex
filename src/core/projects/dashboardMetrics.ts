
function pct(numerator:number,denominator:number){
 return Math.round((numerator/denominator)*10000)/100;
}

export function activationRate(activatedCount:number,totalCount:number){
 if(totalCount<0||activatedCount<0||activatedCount>totalCount)throw new Error("METRIC_INPUT_INVALID");
 return totalCount===0?0:pct(activatedCount,totalCount);
}

export function generationSuccessRate(succeeded:number,total:number){
 if(total<0||succeeded<0||succeeded>total)throw new Error("METRIC_INPUT_INVALID");
 return total===0?100:pct(succeeded,total);
}

export function creditsRemainingPct(balance:number,included:number){
 if(balance<0||included<=0)throw new Error("METRIC_INPUT_INVALID");
 return Math.min(100,pct(balance,included));
}

export function summarizeKpis(input:{activated:number;totalUsers:number;generationsSucceeded:number;generationsTotal:number;creditBalance:number;includedCredits:number}){
 return {
  activationRatePct:activationRate(input.activated,input.totalUsers),
  generationSuccessRatePct:generationSuccessRate(input.generationsSucceeded,input.generationsTotal),
  creditsRemainingPct:creditsRemainingPct(input.creditBalance,input.includedCredits),
 };
}
