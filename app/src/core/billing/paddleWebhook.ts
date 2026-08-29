
export type PaddleEventType=
 "subscription.created"|"subscription.activated"|"subscription.updated"|
 "subscription.canceled"|"subscription.paused"|"subscription.past_due"|
 "transaction.completed"|"transaction.payment_failed"|"adjustment.created";

export type EntitlementAction="grant_access"|"sync_plan"|"revoke_access_scheduled"|
 "revoke_access_now"|"apply_grace_period"|"record_payment"|"record_financial_event";

const ACTION_MAP:Record<PaddleEventType,EntitlementAction>={
 "subscription.created":"grant_access",
 "subscription.activated":"grant_access",
 "subscription.updated":"sync_plan",
 "subscription.canceled":"revoke_access_scheduled",
 "subscription.paused":"revoke_access_now",
 "subscription.past_due":"apply_grace_period",
 "transaction.completed":"record_payment",
 "transaction.payment_failed":"apply_grace_period",
 "adjustment.created":"record_financial_event",
};

export function actionForEvent(type:PaddleEventType):EntitlementAction{
 const action=ACTION_MAP[type];
 if(!action)throw new Error("PADDLE_EVENT_TYPE_UNSUPPORTED");
 return action;
}

export type SubscriptionStatus="active"|"trialing"|"past_due"|"paused"|"canceled";
const STATUS_WHITELIST=new Set<SubscriptionStatus>(["active","trialing","past_due","paused","canceled"]);
export function normalizeSubscriptionStatus(raw:string):SubscriptionStatus{
 const s=raw.toLowerCase() as SubscriptionStatus;
 if(!STATUS_WHITELIST.has(s))throw new Error("PADDLE_STATUS_UNRECOGNIZED");
 return s;
}

export function hasAccess(status:SubscriptionStatus){
 return status==="active"||status==="trialing"||status==="past_due";
}

// Idempotency: Paddle may redeliver the same webhook event; callers should persist
// processed event IDs and use this guard before applying any entitlement change.
export function assertNotProcessed(processedEventIds:Set<string>,eventId:string){
 if(!eventId)throw new Error("PADDLE_EVENT_ID_MISSING");
 if(processedEventIds.has(eventId))throw new Error("PADDLE_EVENT_ALREADY_PROCESSED");
}
