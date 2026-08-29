import {NextResponse} from "next/server";
import {tierLimits,type PlanTier} from "@/core/scheduling/limits";
export async function GET(req:Request){
 const tier=(new URL(req.url).searchParams.get("tier")||"free") as PlanTier;
 if(!["free","starter","mid","pro"].includes(tier)) return NextResponse.json({error:"invalid_tier"},{status:400});
 return NextResponse.json({tier,limits:tierLimits(tier)});
}
