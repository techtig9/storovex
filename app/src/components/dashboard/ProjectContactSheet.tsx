import React from "react";

export type ProjectSummary={id:string;name:string;status:"draft"|"active"|"archived";updatedAt:string;frameCount:number};

const STATUS_LABEL:Record<ProjectSummary["status"],string>={draft:"Draft",active:"Active",archived:"Archived"};

export function ProjectContactSheet(props:{projects:ProjectSummary[];onOpen:(id:string)=>void}){
 if(props.projects.length===0){
  return (
   <div role="status" style={{
    border:"1px dashed var(--border)",
    borderRadius:"var(--radius-lg)",
    padding:"var(--space-12)",
    textAlign:"center",
    color:"var(--ink-muted)",
   }}>
    <p style={{margin:0,fontFamily:"var(--font-display)",fontSize:18,color:"var(--ink)"}}>No projects yet</p>
    <p style={{margin:"var(--space-2) 0 0"}}>Start a project to load your first roll.</p>
   </div>
  );
 }
 return (
  <ul style={{
   display:"grid",
   gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",
   gap:"var(--space-3)",
   listStyle:"none",
   margin:0,
   padding:0,
  }}>
   {props.projects.map((p,i)=>(
    <li key={p.id}>
     <button
      onClick={()=>props.onOpen(p.id)}
      style={{
       width:"100%",
       textAlign:"left",
       background:"var(--surface)",
       border:"1px solid var(--border)",
       borderRadius:"var(--radius-md)",
       padding:"var(--space-3)",
       cursor:"pointer",
       font:"inherit",
       color:"var(--ink)",
      }}
     >
      <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--ink-muted)"}}>
       frame {String(i+1).padStart(2,"0")}
      </span>
      <p style={{margin:"var(--space-1) 0",fontFamily:"var(--font-display)",fontWeight:600,fontSize:15}}>{p.name}</p>
      <p style={{margin:0,fontSize:12,color:"var(--ink-muted)"}}>
       {STATUS_LABEL[p.status]} · {p.frameCount} {p.frameCount===1?"asset":"assets"}
      </p>
     </button>
    </li>
   ))}
  </ul>
 );
}
