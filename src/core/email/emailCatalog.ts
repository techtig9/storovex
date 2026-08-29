
export type EmailEventType=
 "welcome"|"email_verification"|"password_reset"|
 "subscription_activated"|"subscription_canceled"|"payment_failed"|"grace_period_started"|
 "low_credit_warning"|"credits_exhausted"|
 "generation_completed"|"generation_failed"|
 "team_invitation"|"team_invitation_accepted";

export const TEMPLATE_REQUIRED_VARS:Record<EmailEventType,string[]>={
 welcome:["userName"],
 email_verification:["verificationUrl"],
 password_reset:["resetUrl"],
 subscription_activated:["planName"],
 subscription_canceled:["planName","accessUntil"],
 payment_failed:["planName","retryUrl"],
 grace_period_started:["planName","graceEndsAt"],
 low_credit_warning:["creditsRemaining","topUpUrl"],
 credits_exhausted:["topUpUrl"],
 generation_completed:["projectName","assetCount"],
 generation_failed:["projectName","reason"],
 team_invitation:["inviterName","storeName","acceptUrl"],
 team_invitation_accepted:["memberEmail","storeName"],
};

export function assertTemplateVarsComplete(type:EmailEventType,vars:Record<string,unknown>){
 const required=TEMPLATE_REQUIRED_VARS[type];
 if(!required)throw new Error("EMAIL_EVENT_TYPE_INVALID");
 const missing=required.filter(k=>vars[k]===undefined||vars[k]===null||vars[k]==="");
 if(missing.length>0)throw new Error(`EMAIL_TEMPLATE_VARS_MISSING: ${missing.join(",")}`);
 return true;
}

// Security-critical transactional mail must reach the inbox even if the address is
// otherwise suppressed for marketing-adjacent notifications; everything else must not.
const BYPASSES_SUPPRESSION=new Set<EmailEventType>(["password_reset","email_verification"]);
export function mustBypassSuppression(type:EmailEventType){
 if(!(type in TEMPLATE_REQUIRED_VARS))throw new Error("EMAIL_EVENT_TYPE_INVALID");
 return BYPASSES_SUPPRESSION.has(type);
}
