
export type FeatureFlag={enabled:boolean;rolloutPct?:number};

// bucketValue should be a stable 0-99 hash of (flagKey, userId or storeId) supplied by the caller,
// so the same subject always lands on the same side of the rollout percentage.
export function isFeatureEnabled(flag:FeatureFlag,bucketValue:number){
 if(bucketValue<0||bucketValue>99)throw new Error("BUCKET_VALUE_INVALID");
 if(!flag.enabled)return false;
 if(flag.rolloutPct===undefined)return true;
 if(flag.rolloutPct<0||flag.rolloutPct>100)throw new Error("ROLLOUT_PCT_INVALID");
 return bucketValue<flag.rolloutPct;
}

const MIN_OVERRIDE_REASON_LENGTH=10;
export function assertPlanOverrideReasonProvided(reason:string){
 if(!reason||reason.trim().length<MIN_OVERRIDE_REASON_LENGTH)throw new Error("PLAN_OVERRIDE_REASON_REQUIRED");
}

export function isDeadLetterQueueUnhealthy(deadLetterCount:number,totalJobsLast24h:number,thresholdPct=5){
 if(deadLetterCount<0||totalJobsLast24h<0||deadLetterCount>totalJobsLast24h)throw new Error("DEAD_LETTER_INPUT_INVALID");
 if(totalJobsLast24h===0)return deadLetterCount>0;
 return (deadLetterCount/totalJobsLast24h)*100>thresholdPct;
}
