
import {safeFilename} from "./uploadSecurity";

export type BucketName="avatars"|"uploads"|"generated-assets"|"project-assets"|"exports"|"public-store-assets";

export const BUCKET_ACCESS:Record<BucketName,"private"|"public">={
 "avatars":"private",
 "uploads":"private",
 "generated-assets":"private",
 "project-assets":"private",
 "exports":"private",
 "public-store-assets":"public",
};

export const DEFAULT_SIGNED_URL_TTL_SECONDS=300;
export const MAX_SIGNED_URL_TTL_SECONDS=3600;

export function requiresSignedUrl(bucket:BucketName){
 if(!(bucket in BUCKET_ACCESS))throw new Error("BUCKET_UNKNOWN");
 return BUCKET_ACCESS[bucket]==="private";
}

export function assertValidTtl(ttlSeconds:number){
 if(!Number.isInteger(ttlSeconds)||ttlSeconds<=0||ttlSeconds>MAX_SIGNED_URL_TTL_SECONDS)throw new Error("SIGNED_URL_TTL_INVALID");
}

const UUID_RE=/^[0-9a-f-]{36}$/i;
export function buildAssetPath(bucket:BucketName,storeId:string,projectId:string,assetId:string,filename:string){
 if(!(bucket in BUCKET_ACCESS))throw new Error("BUCKET_UNKNOWN");
 if(!UUID_RE.test(storeId)||!UUID_RE.test(projectId)||!UUID_RE.test(assetId))throw new Error("INVALID_ASSET_PATH_ID");
 return `${bucket}/${storeId}/${projectId}/${assetId}/${safeFilename(filename)}`;
}

// A publish action is the only thing allowed to move an object from a private bucket
// into public-store-assets; nothing else should ever grant public access.
export function assertPublishAllowed(sourceBucket:BucketName,targetBucket:BucketName){
 if(targetBucket==="public-store-assets"&&sourceBucket!=="project-assets"&&sourceBucket!=="generated-assets")
  throw new Error("PUBLISH_SOURCE_BUCKET_NOT_ALLOWED");
}
