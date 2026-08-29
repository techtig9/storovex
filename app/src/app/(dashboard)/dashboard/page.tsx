"use client";
import React, {useEffect, useState} from "react";
import {AppShell} from "../../../components/shell/AppShell";
import {KpiGrid,kpiCardsFromSummary} from "../../../components/dashboard/KpiGrid";
import {ProjectContactSheet,type ProjectSummary} from "../../../components/dashboard/ProjectContactSheet";
import {resolveTheme,type ThemeId} from "../../../core/theme/themeTokens";
import {isSidebarCollapsedByDefault,breakpointForWidth} from "../../../core/ui/breakpoints";
import {NAV_ITEMS} from "../../../components/shell/navItems";

export default function DashboardPage(){
 const [theme,setTheme]=useState<ThemeId>(resolveTheme(typeof window!=="undefined"?window.localStorage.getItem("storovex-theme"):undefined));
 const [collapsed,setCollapsed]=useState(false);
 const [kpis,setKpis]=useState<{activationRatePct:number;generationSuccessRatePct:number;creditsRemainingPct:number}|null>(null);
 const [projects,setProjects]=useState<ProjectSummary[]|null>(null);

 useEffect(()=>{
  setCollapsed(isSidebarCollapsedByDefault(breakpointForWidth(window.innerWidth)));
  const onResize=()=>setCollapsed(isSidebarCollapsedByDefault(breakpointForWidth(window.innerWidth)));
  window.addEventListener("resize",onResize);
  return ()=>window.removeEventListener("resize",onResize);
 },[]);

 useEffect(()=>{
  fetch("/api/dashboard/kpis?storeId=current").then(r=>r.json()).then(setKpis).catch(()=>setKpis(null));
  fetch("/api/projects?storeId=current").then(r=>r.json()).then(d=>setProjects(d.projects??[])).catch(()=>setProjects([]));
 },[]);

 function handleThemeChange(next:ThemeId){
  setTheme(next);
  window.localStorage.setItem("storovex-theme",next);
 }

 return (
  <AppShell
   items={NAV_ITEMS} activeId="dashboard" sidebarCollapsed={collapsed} storeName="Your store"
   creditsRemaining={kpis?Math.round(kpis.creditsRemainingPct):0} theme={theme} onThemeChange={handleThemeChange}
  >
   <h1 style={{fontFamily:"var(--font-display)",fontSize:24,marginTop:0}}>Dashboard</h1>
   {kpis?(
    <KpiGrid cards={kpiCardsFromSummary(kpis)} />
   ):(
    <p role="status" style={{color:"var(--ink-muted)"}}>Loading your numbers…</p>
   )}
   <h2 style={{fontFamily:"var(--font-display)",fontSize:18,marginTop:"var(--space-8)"}}>Projects</h2>
   {projects?(
    <ProjectContactSheet projects={projects} onOpen={id=>{window.location.href=`/projects/${id}`;}} />
   ):(
    <p role="status" style={{color:"var(--ink-muted)"}}>Loading your projects…</p>
   )}
  </AppShell>
 );
}
