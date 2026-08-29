
export function validateHttpUrl(value:string){
 const u=new URL(value);
 if(u.protocol!=="https:"&&u.protocol!=="http:")throw new Error("INVALID_URL_PROTOCOL");
 if(u.username||u.password)throw new Error("URL_CREDENTIALS_NOT_ALLOWED");
 return u.toString();
}
