export type PlanTier="free"|"starter"|"mid"|"pro";
export const LIMITS:Record<PlanTier,{global:number;perStore:number;perUser:number;perProvider:number;ratePerMinute:number}>={
 free:{global:5,perStore:1,perUser:1,perProvider:1,ratePerMinute:5},
 starter:{global:20,perStore:3,perUser:3,perProvider:3,ratePerMinute:20},
 mid:{global:50,perStore:8,perUser:8,perProvider:8,ratePerMinute:60},
 pro:{global:100,perStore:20,perUser:20,perProvider:15,ratePerMinute:120}
};
export function tierLimits(tier:PlanTier){return LIMITS[tier];}
