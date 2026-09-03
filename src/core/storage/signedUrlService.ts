
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {requiresSignedUrl,assertValidTtl,DEFAULT_SIGNED_URL_TTL_SECONDS,type BucketName} from "./signedUrl";

export async function createAssetSignedUrl(input:{bucket:BucketName;storagePath:string;ttlSeconds?:number}){
 const ttl=input.ttlSeconds??DEFAULT_SIGNED_URL_TTL_SECONDS;
 assertValidTtl(ttl);
 if(!requiresSignedUrl(input.bucket))throw new Error("BUCKET_IS_PUBLIC_NO_SIGNING_NEEDED");
 const c=createServiceRoleSupabase();
 const {data,error}=await c.storage.from(input.bucket).createSignedUrl(input.storagePath,ttl);
 if(error||!data?.signedUrl)throw new Error(`SIGNED_URL_FAILED: ${error?.message??"unknown"}`);
 return {url:data.signedUrl,expiresInSeconds:ttl};
}
