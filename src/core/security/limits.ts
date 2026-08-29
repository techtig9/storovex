
export const INPUT_LIMITS={jsonBytes:1024*1024,promptChars:100000,systemChars:30000,fileBytes:25*1024*1024};
export function assertJsonSize(bytes:number){if(bytes>INPUT_LIMITS.jsonBytes)throw new Error("REQUEST_TOO_LARGE")}
export function assertFileSize(bytes:number){if(bytes>INPUT_LIMITS.fileBytes)throw new Error("FILE_TOO_LARGE")}
export function allowedUploadType(mime:string){return new Set(["image/png","image/jpeg","image/webp","application/pdf","text/plain"]).has(mime.toLowerCase())}
