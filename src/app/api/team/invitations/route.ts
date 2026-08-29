
import {NextRequest,NextResponse} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {createInvitation} from "@/core/team/invitationService";
import type {Role} from "@/core/auth/authorization";

export async function POST(req:NextRequest){
 const body=await req.json();
 try{
  const membership=await authorizeStoreAction(body.storeId,"members:manage");
  const invite=await createInvitation({
   storeId:body.storeId,inviterRole:membership.role as Role,targetRole:body.targetRole,email:body.email,
  });
  return NextResponse.json(invite,{status:201});
 }catch(e){
  const message=e instanceof Error?e.message:"INVITATION_CREATE_FAILED";
  const status=message==="FORBIDDEN"||message==="STORE_ACCESS_DENIED"?403:400;
  return NextResponse.json({error:message},{status});
 }
}
