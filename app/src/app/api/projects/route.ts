
import {NextRequest,NextResponse} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {listProjects,createProject} from "@/core/projects/projectService";

export async function GET(req:NextRequest){
 const {searchParams}=new URL(req.url);
 const storeId=searchParams.get("storeId")??"";
 try{
  await authorizeStoreAction(storeId,"store:read");
  const result=await listProjects({
   storeId,
   search:searchParams.get("search")??undefined,
   status:searchParams.get("status")??undefined,
   sortField:searchParams.get("sortField")??undefined,
   sortDirection:searchParams.get("sortDirection")??undefined,
   page:searchParams.get("page")?Number(searchParams.get("page")):undefined,
   pageSize:searchParams.get("pageSize")?Number(searchParams.get("pageSize")):undefined,
  });
  return NextResponse.json(result);
 }catch(e){
  const message=e instanceof Error?e.message:"PROJECT_LIST_FAILED";
  const status=message==="FORBIDDEN"||message==="STORE_ACCESS_DENIED"?403:400;
  return NextResponse.json({error:message},{status});
 }
}

export async function POST(req:NextRequest){
 const body=await req.json();
 try{
  const membership=await authorizeStoreAction(body.storeId,"store:write");
  const project=await createProject({storeId:body.storeId,userId:membership.user.id,name:body.name,templateId:body.templateId});
  return NextResponse.json(project,{status:201});
 }catch(e){
  const message=e instanceof Error?e.message:"PROJECT_CREATE_FAILED";
  const status=message==="FORBIDDEN"||message==="STORE_ACCESS_DENIED"?403:400;
  return NextResponse.json({error:message},{status});
 }
}
