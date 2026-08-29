"use client";
import React, {useState} from "react";
import {AppShell} from "../../../components/shell/AppShell";
import {PlanCard} from "../../../components/billing/PlanCard";
import {resolveTheme,type ThemeId} from "../../../core/theme/themeTokens";
import type {PlanId,BillingCycle} from "../../../core/billing/plans";
import {NAV_ITEMS} from "../../../components/shell/navItems";

const PLAN_IDS:PlanId[]=["starter","mid","pro"];

export default function BillingPage(){
 const [theme,setTheme]=useState<ThemeId>(resolveTheme(typeof window!=="undefined"?window.localStorage.getItem("storovex-theme"):undefined));
 const [currentPlan,setCurrentPlan]=useState<PlanId>("starter");
 const [cycle]=useState<BillingCycle>("monthly");

 return (
  <AppShell
   items={NAV_ITEMS} activeId="billing" sidebarCollapsed={false} storeName="Your store"
   creditsRemaining={0} theme={theme} onThemeChange={setTheme}
  >
   <h1 style={{fontFamily:"var(--font-display)",fontSize:24,marginTop:0}}>Billing</h1>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))",gap:"var(--space-4)",maxWidth:900}}>
    {PLAN_IDS.map(id=>(
     <PlanCard key={id} planId={id} cycle={cycle} current={id===currentPlan} onSelect={setCurrentPlan} />
    ))}
   </div>
  </AppShell>
 );
}
