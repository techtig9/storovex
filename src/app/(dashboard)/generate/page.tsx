"use client";
import React, {useState} from "react";
import {AppShell} from "../../../components/shell/AppShell";
import {GenerationForm} from "../../../components/generation/GenerationForm";
import {GenerationProgress} from "../../../components/generation/GenerationProgress";
import {resolveTheme,type ThemeId} from "../../../core/theme/themeTokens";
import type {AnnouncedStage} from "../../../core/ui/accessibility";
import type {GenerationType,Quality} from "../../../core/generation/catalog";
import {NAV_ITEMS} from "../../../components/shell/navItems";
import {randomToken} from "../../../core/ui/randomToken";

export default function GeneratePage(){
 const [theme,setTheme]=useState<ThemeId>(resolveTheme(typeof window!=="undefined"?window.localStorage.getItem("storovex-theme"):undefined));
 const [submitting,setSubmitting]=useState(false);
 const [stage,setStage]=useState<AnnouncedStage|null>(null);
 const [errorMessage,setErrorMessage]=useState<string|undefined>();

 async function handleSubmit(input:{type:GenerationType;quality:Quality;count:number}){
  setSubmitting(true);
  setErrorMessage(undefined);
  setStage("planning");
  try{
   const res=await fetch("/api/generation",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...input,storeId:"current",projectId:"current",accountId:"current",planId:"starter",idempotencyKey:randomToken()}),
   });
   if(res.status===402){setErrorMessage("Not enough credits for this generation.");setStage("failed");return;}
   if(!res.ok){setErrorMessage("Couldn't start the generation. Try again.");setStage("failed");return;}
   setStage(((await res.json()).stage as AnnouncedStage)??"building");
  }catch{
   setErrorMessage("Couldn't reach the server. Check your connection and try again.");
   setStage("failed");
  }finally{
   setSubmitting(false);
  }
 }

 return (
  <AppShell
   items={NAV_ITEMS} activeId="generate" sidebarCollapsed={false} storeName="Your store"
   creditsRemaining={0} theme={theme} onThemeChange={setTheme}
  >
   <h1 style={{fontFamily:"var(--font-display)",fontSize:24,marginTop:0}}>Generate</h1>
   <div style={{display:"grid",gridTemplateColumns:"minmax(280px, 420px) 1fr",gap:"var(--space-8)"}}>
    <GenerationForm onSubmit={handleSubmit} submitting={submitting} />
    <div>
     {stage&&<GenerationProgress stage={stage} />}
     {errorMessage&&<p role="alert" style={{color:"var(--accent)",marginTop:"var(--space-3)"}}>{errorMessage}</p>}
    </div>
   </div>
  </AppShell>
 );
}
