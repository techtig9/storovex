"use client";
import React, {useState} from "react";
import {PlanCard} from "../../../components/billing/PlanCard";
import type {PlanId,BillingCycle} from "../../../core/billing/plans";

const PLAN_IDS:PlanId[]=["starter","mid","pro"];

export default function PricingPage(){
 const [cycle,setCycle]=useState<BillingCycle>("monthly");
 return (
  <div data-theme="daylight" style={{background:"var(--bg)",color:"var(--ink)",minHeight:"100vh",padding:"var(--space-12) var(--space-8)"}}>
   <h1 style={{fontFamily:"var(--font-display)",fontSize:32,margin:0}}>Plans</h1>
   <p style={{color:"var(--ink-muted)",marginTop:"var(--space-2)"}}>Every plan includes the full generation catalog. Credits reset each billing period.</p>

   <div role="radiogroup" aria-label="Billing cycle" style={{display:"flex",gap:"var(--space-2)",margin:"var(--space-6) 0"}}>
    {(["monthly","annual"] as BillingCycle[]).map(c=>(
     <button key={c} role="radio" aria-checked={cycle===c} onClick={()=>setCycle(c)}
      style={{
       padding:"var(--space-2) var(--space-4)",borderRadius:"var(--radius-md)",
       border:"1px solid var(--border)",background:cycle===c?"var(--accent)":"var(--surface)",
       color:cycle===c?"var(--accent-ink)":"var(--ink)",fontWeight:600,cursor:"pointer",
      }}>
      {c==="monthly"?"Monthly":"Annual (20% off)"}
     </button>
    ))}
   </div>

   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))",gap:"var(--space-4)",maxWidth:900}}>
    {PLAN_IDS.map(id=>(
     <PlanCard key={id} planId={id} cycle={cycle} current={false} onSelect={()=>{}} />
    ))}
   </div>
  </div>
 );
}
