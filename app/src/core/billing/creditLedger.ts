
export type LedgerEventType="reservation"|"commit"|"refund"|"adjustment"|"grant"|"expiry";
export type LedgerEntry={id:string;accountId:string;type:LedgerEventType;amount:number;jobId?:string;idempotencyKey?:string;reason?:string;createdAt:number};

// Sign convention: reservation/commit/expiry are negative deltas to available balance,
// refund/adjustment(can be +/- but treated as provided)/grant are positive deltas.
// A "commit" converts a held reservation into permanent usage, so it does not double-subtract:
// balance = sum(grant) + sum(refund) + sum(adjustment) - sum(reservation not yet committed or refunded)
// We model it simply as a running signed-amount ledger where callers pass the correct signed amount
// per event, and this module enforces invariants rather than inferring sign.
export function signedDelta(type:LedgerEventType,amount:number){
 if(amount<0)throw new Error("LEDGER_AMOUNT_MUST_BE_NON_NEGATIVE");
 switch(type){
  case "grant": case "refund": return amount;
  case "reservation": case "commit": case "expiry": return -amount;
  case "adjustment": return amount; // adjustment amount is pre-signed by caller via reason/positive convention at call site
  default: throw new Error("LEDGER_EVENT_TYPE_INVALID");
 }
}

export function computeBalance(entries:{type:LedgerEventType;amount:number;signed?:number}[]){
 return entries.reduce((sum,e)=>sum+(typeof e.signed==="number"?e.signed:signedDelta(e.type,e.amount)),0);
}

export class InsufficientCreditsError extends Error{constructor(){super("INSUFFICIENT_CREDITS")}}
export class DuplicateLedgerEntryError extends Error{constructor(){super("DUPLICATE_IDEMPOTENCY_KEY")}}

export function assertIdempotent(existingKeys:Set<string>,idempotencyKey:string){
 if(existingKeys.has(idempotencyKey))throw new DuplicateLedgerEntryError();
}

export function reserveCredits(currentBalance:number,amount:number,maxSpendPerJob:number){
 if(!Number.isInteger(amount)||amount<=0)throw new Error("LEDGER_AMOUNT_INVALID");
 if(amount>maxSpendPerJob)throw new Error("LEDGER_JOB_SPEND_LIMIT_EXCEEDED");
 if(currentBalance-amount<0)throw new InsufficientCreditsError();
 return currentBalance-amount;
}

export function commitReservation(reservedAmount:number,actualAmount:number){
 if(!Number.isInteger(actualAmount)||actualAmount<0)throw new Error("LEDGER_AMOUNT_INVALID");
 if(actualAmount>reservedAmount)throw new Error("LEDGER_COMMIT_EXCEEDS_RESERVATION");
 // Any unused portion of the reservation is refunded back to the balance.
 return {committed:actualAmount,refunded:reservedAmount-actualAmount};
}

export function refundReservation(reservedAmount:number){
 if(!Number.isInteger(reservedAmount)||reservedAmount<0)throw new Error("LEDGER_AMOUNT_INVALID");
 return reservedAmount;
}
