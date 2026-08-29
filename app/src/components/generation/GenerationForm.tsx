import React, {useState} from "react";
import {estimateCredits,type GenerationType,type Quality} from "../../core/generation/catalog";

const TYPE_OPTIONS:{value:GenerationType;label:string}[]=[
 {value:"product_hero",label:"Product hero shot"},
 {value:"product_lifestyle",label:"Lifestyle scene"},
 {value:"campaign",label:"Campaign set"},
 {value:"collection",label:"Collection layout"},
 {value:"banner",label:"Banner"},
 {value:"social_creative",label:"Social creative"},
];
const QUALITY_OPTIONS:{value:Quality;label:string}[]=[
 {value:"draft",label:"Draft"},
 {value:"standard",label:"Standard"},
 {value:"high",label:"High"},
];

export function GenerationForm(props:{onSubmit:(input:{type:GenerationType;quality:Quality;count:number})=>void;submitting:boolean}){
 const [type,setType]=useState<GenerationType>("product_hero");
 const [quality,setQuality]=useState<Quality>("standard");
 const [count,setCount]=useState(1);
 const estimated=estimateCredits(type,quality,count);

 return (
  <form
   onSubmit={e=>{e.preventDefault();props.onSubmit({type,quality,count});}}
   style={{display:"flex",flexDirection:"column",gap:"var(--space-4)",maxWidth:420}}
  >
   <div>
    <label htmlFor="gen-type" style={{display:"block",fontSize:13,marginBottom:"var(--space-1)"}}>What are you generating?</label>
    <select id="gen-type" value={type} onChange={e=>setType(e.target.value as GenerationType)}
     style={{width:"100%",padding:"var(--space-2)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",background:"var(--surface)",color:"var(--ink)"}}>
     {TYPE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
   </div>
   <div>
    <label htmlFor="gen-quality" style={{display:"block",fontSize:13,marginBottom:"var(--space-1)"}}>Quality</label>
    <select id="gen-quality" value={quality} onChange={e=>setQuality(e.target.value as Quality)}
     style={{width:"100%",padding:"var(--space-2)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",background:"var(--surface)",color:"var(--ink)"}}>
     {QUALITY_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
   </div>
   <div>
    <label htmlFor="gen-count" style={{display:"block",fontSize:13,marginBottom:"var(--space-1)"}}>How many</label>
    <input id="gen-count" type="number" min={1} max={20} value={count}
     onChange={e=>setCount(Math.max(1,Math.min(20,Number(e.target.value)||1)))}
     style={{width:"100%",padding:"var(--space-2)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",background:"var(--surface)",color:"var(--ink)"}} />
   </div>
   <p style={{margin:0,fontFamily:"var(--font-mono)",fontSize:13,color:"var(--ink-muted)"}}>
    Estimated cost: {estimated} credits
   </p>
   <button type="submit" disabled={props.submitting}
    style={{
     padding:"var(--space-3) var(--space-4)",
     background:"var(--accent)",
     color:"var(--accent-ink)",
     border:"none",
     borderRadius:"var(--radius-md)",
     fontFamily:"var(--font-display)",
     fontWeight:600,
     cursor:props.submitting?"default":"pointer",
     opacity:props.submitting?0.6:1,
    }}>
    {props.submitting?"Starting…":"Generate"}
   </button>
  </form>
 );
}
