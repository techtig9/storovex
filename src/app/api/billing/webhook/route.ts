
import {NextRequest,NextResponse} from "next/server";
import {actionForEvent,assertNotProcessed,normalizeSubscriptionStatus,type PaddleEventType} from "@/core/billing/paddleWebhook";
import {verifyPaddleSignature} from "@/core/billing/paddleSignature";
import {createServerStorageClient} from "@/core/storage/supabaseStorage";

export async function POST(req:NextRequest){
 const rawBody=await req.text();
 const signatureHeader=req.headers.get("paddle-signature");
 const secret=process.env.PADDLE_WEBHOOK_SECRET;

 if(!secret)return NextResponse.json({error:"PADDLE_WEBHOOK_SECRET_NOT_CONFIGURED"},{status:500});
 if(!signatureHeader)return NextResponse.json({error:"PADDLE_SIGNATURE_MISSING"},{status:401});
 try{
  verifyPaddleSignature(signatureHeader,rawBody,secret);
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"PADDLE_SIGNATURE_INVALID"},{status:401});
 }

 const body=JSON.parse(rawBody);
 const eventId:string|undefined=body?.event_id;
 const eventType:PaddleEventType|undefined=body?.event_type;
 if(!eventId||!eventType)return NextResponse.json({error:"PADDLE_EVENT_MALFORMED"},{status:400});

 const c=createServerStorageClient();
 const {data:processed}=await c.from("billing_webhook_events").select("id").eq("id",eventId).maybeSingle();
 try{
  const known=processed?new Set([processed.id]):new Set<string>();
  assertNotProcessed(known,eventId);
 }catch{
  return NextResponse.json({status:"already_processed"},{status:200});
 }

 const action=actionForEvent(eventType);
 if(body?.data?.status){
  normalizeSubscriptionStatus(body.data.status); // throws on unrecognized status
 }

 const {error}=await c.from("billing_webhook_events").insert({id:eventId,type:eventType,action,payload:body});
 if(error)return NextResponse.json({error:"WEBHOOK_PERSIST_FAILED"},{status:500});

 return NextResponse.json({status:"ok",action});
}
