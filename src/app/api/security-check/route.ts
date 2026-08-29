
import {NextRequest} from "next/server";
import {applySecurity,apiSuccess} from "@/core/security/api";
export async function GET(req:NextRequest){
 const guard=applySecurity(req,["GET"]); if(guard)return guard;
 return apiSuccess({protected:true});
}
