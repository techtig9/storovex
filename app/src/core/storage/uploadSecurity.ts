
export const MAX_UPLOAD_BYTES=10*1024*1024;
export const ALLOWED_MIME=new Set(["image/jpeg","image/png","image/webp","application/pdf","text/plain"]);
const ext:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf","text/plain":"txt"};
export function validateUpload(input:{size:number;mime:string;name:string}){
 if(!Number.isInteger(input.size)||input.size<=0||input.size>MAX_UPLOAD_BYTES) throw new Error("UPLOAD_SIZE_INVALID");
 if(!ALLOWED_MIME.has(input.mime)) throw new Error("UPLOAD_MIME_NOT_ALLOWED");
 if(!input.name||input.name.length>180||/[\\/\0-\x1f\x7f]/.test(input.name)) throw new Error("UPLOAD_FILENAME_INVALID");
 return {extension:ext[input.mime]};
}
export function safeFilename(name:string){
 const base=name.normalize("NFKC").split(/[\\/]/).pop()||"";
 const cleaned=base.replace(/[^\p{L}\p{N}._-]+/gu,"_").replace(/^[._]+/,"").replace(/_{2,}/g,"_").slice(0,140);
 return cleaned||"upload";
}
export function storagePath(storeId:string,userId:string,fileId:string,filename:string){
 if(!/^[0-9a-f-]{36}$/i.test(storeId)||!/^[0-9a-f-]{36}$/i.test(userId)||!/^[0-9a-f-]{36}$/i.test(fileId)) throw new Error("INVALID_STORAGE_ID");
 return `${storeId}/${userId}/${fileId}/${safeFilename(filename)}`;
}
