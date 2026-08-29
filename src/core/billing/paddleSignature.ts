
import {createHmac,timingSafeEqual} from "crypto";

export function parsePaddleSignatureHeader(header:string){
 const parts=Object.fromEntries(header.split(";").map(p=>p.split("=") as [string,string]));
 const ts=parts["ts"];
 const h1=parts["h1"];
 if(!ts||!h1)throw new Error("PADDLE_SIGNATURE_HEADER_MALFORMED");
 return {ts,h1};
}

export function computePaddleSignature(secret:string,ts:string,rawBody:string){
 return createHmac("sha256",secret).update(`${ts}:${rawBody}`).digest("hex");
}

// Paddle signs as ts=<unix seconds>;h1=<hex hmac of "ts:rawBody">. A replay window
// caps how old an otherwise-valid signature can be, and the comparison is
// timing-safe so response latency can't leak how many bytes matched.
export function verifyPaddleSignature(header:string,rawBody:string,secret:string,nowMs=Date.now(),maxAgeSeconds=300){
 const {ts,h1}=parsePaddleSignatureHeader(header);
 const ageSeconds=nowMs/1000-Number(ts);
 if(!Number.isFinite(ageSeconds)||ageSeconds<0||ageSeconds>maxAgeSeconds)throw new Error("PADDLE_SIGNATURE_TIMESTAMP_INVALID");

 const expected=computePaddleSignature(secret,ts,rawBody);
 const expectedBuf=Buffer.from(expected,"hex");
 const actualBuf=Buffer.from(h1,"hex");
 if(expectedBuf.length!==actualBuf.length||!timingSafeEqual(expectedBuf,actualBuf))
  throw new Error("PADDLE_SIGNATURE_MISMATCH");
 return true;
}
