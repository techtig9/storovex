import React from "react";

export type KpiCard={label:string;value:string;hint?:string};

export function KpiGrid(props:{cards:KpiCard[]}){
 return (
  <ul style={{
   display:"grid",
   gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",
   gap:"var(--space-4)",
   listStyle:"none",
   margin:0,
   padding:0,
  }}>
   {props.cards.map(card=>(
    <li key={card.label} style={{
     background:"var(--surface)",
     border:"1px solid var(--border)",
     borderRadius:"var(--radius-lg)",
     padding:"var(--space-4)",
    }}>
     <p style={{margin:0,fontSize:12,color:"var(--ink-muted)",fontFamily:"var(--font-mono)",textTransform:"uppercase",letterSpacing:"0.04em"}}>
      {card.label}
     </p>
     <p style={{margin:"var(--space-2) 0 0",fontSize:28,fontFamily:"var(--font-display)",fontWeight:600}}>
      {card.value}
     </p>
     {card.hint&&<p style={{margin:"var(--space-1) 0 0",fontSize:12,color:"var(--ink-muted)"}}>{card.hint}</p>}
    </li>
   ))}
  </ul>
 );
}

export function kpiCardsFromSummary(summary:{activationRatePct:number;generationSuccessRatePct:number;creditsRemainingPct:number}):KpiCard[]{
 return [
  {label:"Activation",value:`${summary.activationRatePct}%`,hint:"Members who created a project"},
  {label:"Generation success",value:`${summary.generationSuccessRatePct}%`,hint:"Completed vs. attempted"},
  {label:"Credits remaining",value:`${summary.creditsRemainingPct}%`,hint:"Of this billing period's allotment"},
 ];
}
