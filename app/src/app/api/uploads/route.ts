
import {NextRequest,NextResponse} from "next/server";
import {validateUpload} from "@/core/storage/uploadSecurity";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 try{
  const body=await req.json();
  validateUpload({size:Number(body.size),mime:String(body.mime),name:String(body.name)});
  return NextResponse.json({ok:true,message:"Upload metadata validated. Storage signing is handled server-side."});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:"UPLOAD_INVALID"},{status:400});}
}
