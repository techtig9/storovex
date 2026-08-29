
import {createHmac} from "crypto";
import {parsePaddleSignatureHeader,computePaddleSignature,verifyPaddleSignature} from "../billing/paddleSignature";

const SECRET="test_webhook_secret";

function makeHeader(ts:string,rawBody:string,secret=SECRET){
 const h1=createHmac("sha256",secret).update(`${ts}:${rawBody}`).digest("hex");
 return `ts=${ts};h1=${h1}`;
}

describe("Phase 85 finishing touches: Paddle signature verification",()=>{
 it("parses a well-formed signature header",()=>{
  const header=makeHeader("1700000000","{}");
  const {ts,h1}=parsePaddleSignatureHeader(header);
  expect(ts).toBe("1700000000");
  expect(h1).toHaveLength(64);
 });
 it("rejects a malformed header",()=>{
  expect(()=>parsePaddleSignatureHeader("garbage")).toThrow("PADDLE_SIGNATURE_HEADER_MALFORMED");
 });
 it("computes the same signature Paddle's documented format produces",()=>{
  const sig=computePaddleSignature(SECRET,"1700000000","{\"a\":1}");
  expect(sig).toBe(createHmac("sha256",SECRET).update("1700000000:{\"a\":1}").digest("hex"));
 });
 it("verifies a valid, fresh signature",()=>{
  const nowMs=1700000000_000+10_000;
  const header=makeHeader("1700000000","{\"event_id\":\"evt_1\"}");
  expect(verifyPaddleSignature(header,"{\"event_id\":\"evt_1\"}",SECRET,nowMs)).toBe(true);
 });
 it("rejects a signature computed with the wrong secret",()=>{
  const header=makeHeader("1700000000","{}","wrong_secret");
  expect(()=>verifyPaddleSignature(header,"{}",SECRET,1700000010_000)).toThrow("PADDLE_SIGNATURE_MISMATCH");
 });
 it("rejects a tampered body even with a validly-formatted signature",()=>{
  const header=makeHeader("1700000000","{\"amount\":100}");
  expect(()=>verifyPaddleSignature(header,"{\"amount\":999999}",SECRET,1700000010_000)).toThrow("PADDLE_SIGNATURE_MISMATCH");
 });
 it("rejects a signature older than the replay window",()=>{
  const header=makeHeader("1700000000","{}");
  const tooLate=1700000000_000+400_000; // 400s later, beyond the 300s default window
  expect(()=>verifyPaddleSignature(header,"{}",SECRET,tooLate)).toThrow("PADDLE_SIGNATURE_TIMESTAMP_INVALID");
 });
 it("rejects a signature timestamped in the future",()=>{
  const header=makeHeader("1700000000","{}");
  const earlier=1700000000_000-10_000;
  expect(()=>verifyPaddleSignature(header,"{}",SECRET,earlier)).toThrow("PADDLE_SIGNATURE_TIMESTAMP_INVALID");
 });
});
