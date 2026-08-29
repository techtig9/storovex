import React from "react";
import {priceForCycle,includedCredits,maxSpendPerJob,type PlanId,type BillingCycle} from "../../core/billing/plans";

const PLAN_LABEL:Record<PlanId,string>={starter:"Starter",mid:"Mid",pro:"Pro"};

export function PlanCard(props:{planId:PlanId;cycle:BillingCycle;current:boolean;onSelect:(planId:PlanId)=>void}){
 const price=priceForCycle(props.planId,props.cycle);
 const dollars=(price/100).toFixed(0);
 return (
  <div style={{
   border:props.current?"2px solid var(--accent)":"1px solid var(--border)",
   borderRadius:"var(--radius-lg)",
   padding:"var(--space-6)",
   background:"var(--surface)",
   display:"flex",
   flexDirection:"column",
   gap:"var(--space-3)",
  }}>
   <h3 style={{margin:0,fontFamily:"var(--font-display)",fontSize:20}}>{PLAN_LABEL[props.planId]}</h3>
   <p style={{margin:0,fontSize:32,fontFamily:"var(--font-display)",fontWeight:600}}>
    ${dollars}<span style={{fontSize:14,fontWeight:400,color:"var(--ink-muted)"}}>/{props.cycle==="monthly"?"mo":"yr"}</span>
   </p>
   <ul style={{margin:0,padding:0,listStyle:"none",fontSize:13,color:"var(--ink-muted)",display:"flex",flexDirection:"column",gap:"var(--space-1)"}}>
    <li>{includedCredits(props.planId)} credits included</li>
    <li>Up to {maxSpendPerJob(props.planId)} credits per job</li>
   </ul>
   <button
    onClick={()=>props.onSelect(props.planId)}
    disabled={props.current}
    style={{
     marginTop:"auto",
     padding:"var(--space-2) var(--space-4)",
     background:props.current?"var(--surface-2)":"var(--accent)",
     color:props.current?"var(--ink-muted)":"var(--accent-ink)",
     border:"none",
     borderRadius:"var(--radius-md)",
     fontFamily:"var(--font-body)",
     fontWeight:600,
     cursor:props.current?"default":"pointer",
    }}
   >
    {props.current?"Current plan":`Switch to ${PLAN_LABEL[props.planId]}`}
   </button>
  </div>
 );
}
