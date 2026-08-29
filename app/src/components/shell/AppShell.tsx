import React from "react";
import {Sidebar,type SidebarItem} from "./Sidebar";
import {Topbar} from "./Topbar";
import type {ThemeId} from "../../core/theme/themeTokens";

export function AppShell(props:{
 items:SidebarItem[];
 activeId:string;
 sidebarCollapsed:boolean;
 storeName:string;
 projectName?:string;
 assetCount?:number;
 creditsRemaining:number;
 theme:ThemeId;
 onThemeChange:(theme:ThemeId)=>void;
 children:React.ReactNode;
}){
 return (
  <div data-theme={props.theme} style={{display:"flex",minHeight:"100vh",background:"var(--bg)",color:"var(--ink)"}}>
   <a href="#main-content" className="skip-link">Skip to content</a>
   <Sidebar items={props.items} activeId={props.activeId} collapsed={props.sidebarCollapsed} storeName={props.storeName} />
   <div style={{flex:1,display:"flex",flexDirection:"column"}}>
    <Topbar
     projectName={props.projectName}
     assetCount={props.assetCount}
     creditsRemaining={props.creditsRemaining}
     theme={props.theme}
     onThemeChange={props.onThemeChange}
    />
    <main id="main-content" tabIndex={-1} style={{flex:1,padding:"var(--space-8)"}}>
     {props.children}
    </main>
   </div>
  </div>
 );
}
