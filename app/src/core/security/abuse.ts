
export type AbuseSignal={type:"burst"|"repeated_failure"|"invalid_payload"|"retry_abuse";score:number};
export function riskScore(signals:AbuseSignal[]){return Math.min(100,signals.reduce((n,s)=>n+s.score,0));}
export function actionForRisk(score:number):"allow"|"challenge"|"block"{
 if(score>=80)return "block"; if(score>=50)return "challenge"; return "allow";
}
