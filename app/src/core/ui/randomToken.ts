export function randomToken(byteLength=16){
 const bytes=new Uint8Array(byteLength);
 crypto.getRandomValues(bytes);
 return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
}
