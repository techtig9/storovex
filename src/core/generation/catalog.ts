
export type GenerationType="product_hero"|"product_lifestyle"|"campaign"|"collection"|"banner"|"social_creative";
export type AspectRatio="1:1"|"4:5"|"16:9"|"9:16"|"3:4";
export type Quality="draft"|"standard"|"high";

const BASE_CREDIT_COST:Record<GenerationType,number>={
 product_hero:8,
 product_lifestyle:10,
 campaign:15,
 collection:20,
 banner:6,
 social_creative:6,
};

const QUALITY_MULTIPLIER:Record<Quality,number>={draft:0.6,standard:1,high:1.8};

export function estimateCredits(type:GenerationType,quality:Quality,count:number){
 if(!(type in BASE_CREDIT_COST))throw new Error("GENERATION_TYPE_INVALID");
 if(!(quality in QUALITY_MULTIPLIER))throw new Error("GENERATION_QUALITY_INVALID");
 if(!Number.isInteger(count)||count<1||count>20)throw new Error("GENERATION_COUNT_INVALID");
 return Math.max(1,Math.round(BASE_CREDIT_COST[type]*QUALITY_MULTIPLIER[quality]*count));
}

const ASPECT_RATIOS=new Set<AspectRatio>(["1:1","4:5","16:9","9:16","3:4"]);
export function assertValidAspectRatio(ratio:string){
 if(!ASPECT_RATIOS.has(ratio as AspectRatio))throw new Error("ASPECT_RATIO_INVALID");
}
