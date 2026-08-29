
import {NextRequest,NextResponse} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {setProjectStatus,duplicateProject,deleteProject} from "@/core/projects/projectService";

export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){
 const body=await req.json();
 try{
  const membership=await authorizeStoreAction(body.storeId,"store:write");
  if(body.action==="duplicate"){
   const project=await duplicateProject({storeId:body.storeId,userId:membership.user.id,projectId:params.id});
   return NextResponse.json(project,{status:201});
  }
  const project=await setProjectStatus({storeId:body.storeId,projectId:params.id,from:body.from,to:body.to});
  return NextResponse.json(project);
 }catch(e){
  const message=e instanceof Error?e.message:"PROJECT_UPDATE_FAILED";
  const status=message==="FORBIDDEN"||message==="STORE_ACCESS_DENIED"?403:400;
  return NextResponse.json({error:message},{status});
 }
}

export async function DELETE(req:NextRequest,{params}:{params:{id:string}}){
 const {searchParams}=new URL(req.url);
 const storeId=searchParams.get("storeId")??"";
 try{
  await authorizeStoreAction(storeId,"store:write");
  const result=await deleteProject({storeId,projectId:params.id});
  return NextResponse.json(result);
 }catch(e){
  const message=e instanceof Error?e.message:"PROJECT_DELETE_FAILED";
  const status=message==="FORBIDDEN"||message==="STORE_ACCESS_DENIED"?403:400;
  return NextResponse.json({error:message},{status});
 }
}
