import React from "react";
import {THEME_IDS,themeLabel,type ThemeId} from "../../core/theme/themeTokens";

export function Topbar(props:{
 projectName?:string;
 assetCount?:number;
 creditsRemaining:number;
 theme:ThemeId;
 onThemeChange:(theme:ThemeId)=>void;
}){
 const {projectName,assetCount,creditsRemaining,theme,onThemeChange}=props;
 return (
  <header style={{
   display:"flex",
   alignItems:"center",
   justifyContent:"space-between",
   padding:"var(--space-3) var(--space-6)",
   borderBottom:"1px solid var(--border)",
   background:"var(--surface)",
  }}>
   <div style={{display:"flex",alignItems:"baseline",gap:"var(--space-3)"}}>
    <span style={{fontFamily:"var(--font-display)",fontWeight:600,fontSize:15}}>
     {projectName??"No project selected"}
    </span>
    {typeof assetCount==="number"&&(
     <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--ink-muted)"}}>
      {assetCount} {assetCount===1?"frame":"frames"}
     </span>
    )}
   </div>
   <div style={{display:"flex",alignItems:"center",gap:"var(--space-4)"}}>
    <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--ink-muted)"}}>
     {creditsRemaining} credits
    </span>
    <label style={{fontSize:12,display:"flex",alignItems:"center",gap:"var(--space-2)"}}>
     <span className="sr-only" style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0 0 0 0)"}}>Theme</span>
     <select
      value={theme}
      onChange={e=>onThemeChange(e.target.value as ThemeId)}
      style={{
       background:"var(--surface-2)",
       color:"var(--ink)",
       border:"1px solid var(--border)",
       borderRadius:"var(--radius-sm)",
       padding:"var(--space-1) var(--space-2)",
       fontFamily:"var(--font-body)",
       fontSize:12,
      }}
     >
      {THEME_IDS.map(id=>(
       <option key={id} value={id}>{themeLabel(id)}</option>
      ))}
     </select>
    </label>
   </div>
  </header>
 );
}
