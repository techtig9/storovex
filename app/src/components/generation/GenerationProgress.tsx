import React from "react";
import {ariaLiveAnnouncement,type AnnouncedStage} from "../../core/ui/accessibility";

const STAGES:AnnouncedStage[]=["planning","building","generating_assets","finalizing","completed"];
const STAGE_LABEL:Record<AnnouncedStage,string>={
 planning:"Planning",
 building:"Building",
 generating_assets:"Generating",
 finalizing:"Finalizing",
 completed:"Done",
 failed:"Failed",
};

export function GenerationProgress(props:{stage:AnnouncedStage}){
 const failed=props.stage==="failed";
 const currentIndex=STAGES.indexOf(props.stage);
 return (
  <div>
   <ol style={{display:"flex",gap:"var(--space-2)",listStyle:"none",margin:0,padding:0}}>
    {STAGES.map((s,i)=>{
     const reached=!failed&&i<=currentIndex;
     return (
      <li key={s} style={{
       flex:1,
       padding:"var(--space-2) var(--space-1)",
       textAlign:"center",
       fontSize:11,
       fontFamily:"var(--font-mono)",
       borderBottom:`3px solid ${reached?"var(--accent)":"var(--border)"}`,
       color:reached?"var(--ink)":"var(--ink-muted)",
      }}>
       {STAGE_LABEL[s]}
      </li>
     );
    })}
   </ol>
   <p aria-live="polite" role="status" style={{marginTop:"var(--space-3)",fontSize:13,color:failed?"var(--accent)":"var(--ink-muted)"}}>
    {ariaLiveAnnouncement(props.stage)}
   </p>
  </div>
 );
}
