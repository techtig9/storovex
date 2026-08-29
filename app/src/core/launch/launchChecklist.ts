
export type ChecklistItem={id:string;label:string;done:boolean;critical:boolean};

export function launchReadinessPct(items:ChecklistItem[]){
 if(items.length===0)return 0;
 const done=items.filter(i=>i.done).length;
 return Math.round((done/items.length)*10000)/100;
}

export function blockingItems(items:ChecklistItem[]){
 return items.filter(i=>i.critical&&!i.done);
}

export function isLaunchReady(items:ChecklistItem[]){
 return blockingItems(items).length===0;
}

export const DEFAULT_LAUNCH_CHECKLIST:Omit<ChecklistItem,"done">[]=[
 {id:"env_vars",label:"All required environment variables set",critical:true},
 {id:"migrations_applied",label:"All Supabase migrations applied to production",critical:true},
 {id:"billing_webhook_verified",label:"Paddle webhook signature verification live-tested",critical:true},
 {id:"email_domain_verified",label:"Resend sending domain verified (SPF/DKIM)",critical:true},
 {id:"backups_enabled",label:"Automated database backups enabled",critical:true},
 {id:"rls_audited",label:"RLS policies audited on every table",critical:true},
 {id:"error_monitoring",label:"Error monitoring/alerting connected",critical:false},
 {id:"load_test_passed",label:"Load test passed at expected launch traffic",critical:false},
 {id:"accessibility_pass",label:"Keyboard nav and screen-reader pass completed",critical:false},
];
