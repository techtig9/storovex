"use client";
import React, {useEffect, useState} from "react";
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
 const [projectId,setProjectId]=useState<string|undefined>();
 useEffect(()=>{
  setProjectId(new URLSearchParams(window.location.search).get("projectId")??undefined);
 },[]);
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
    // accountId and planId are gone on purpose: the server derives both from the
    // authenticated session. They used to be sent from here, which let a caller pick
    // their own spend cap and name which credit account to bill.
    body:JSON.stringify({projectId,...input,idempotencyKey:randomToken()}),
   });
   const body=await res.json().catch(()=>null);
   if(!res.ok){
    setErrorMessage(body?.error?.message??"Couldn't start the generation. Try again.");
    setStage("failed");
    return;
   }
   setStage((body?.data?.stage as AnnouncedStage)??"building");
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
