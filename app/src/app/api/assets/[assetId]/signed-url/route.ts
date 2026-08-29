
import {NextRequest,NextResponse} from "next/server";
import {authorizeStoreAction} from "@/core/auth/routeGuard";
import {createAssetSignedUrl} from "@/core/storage/signedUrlService";
import type {BucketName} from "@/core/storage/signedUrl";

export async function POST(req:NextRequest,{params}:{params:{assetId:string}}){
 const body=await req.json();
 try{
  await authorizeStoreAction(body.storeId,"store:read");
  const result=await createAssetSignedUrl({
   bucket:body.bucket as BucketName,storagePath:body.storagePath,ttlSeconds:body.ttlSeconds,
  });
  return NextResponse.json(result);
 }catch(e){
  const message=e instanceof Error?e.message:"SIGNED_URL_REQUEST_FAILED";
  const status=message==="FORBIDDEN"||message==="STORE_ACCESS_DENIED"?403:400;
  return NextResponse.json({error:message,assetId:params.assetId},{status});
 }
}
