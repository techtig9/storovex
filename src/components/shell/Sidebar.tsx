import React from "react";

export type SidebarItem={id:string;label:string;href:string;icon:React.ReactNode};

export function Sidebar(props:{items:SidebarItem[];activeId:string;collapsed:boolean;storeName:string}){
 const {items,activeId,collapsed,storeName}=props;
 return (
  <nav aria-label="Primary" data-collapsed={collapsed} style={{
   width:collapsed?64:224,
   background:"var(--surface)",
   borderRight:"1px solid var(--border)",
   height:"100%",
   display:"flex",
   flexDirection:"column",
   padding:"var(--space-3) var(--space-2)",
   gap:"var(--space-1)",
  }}>
   <div style={{
    fontFamily:"var(--font-display)",
    fontWeight:600,
    padding:"var(--space-2)",
    marginBottom:"var(--space-2)",
    whiteSpace:"nowrap",
    overflow:"hidden",
   }}>
    {collapsed?storeName.slice(0,1):storeName}
   </div>
   <ul style={{listStyle:"none",margin:0,padding:0,display:"flex",flexDirection:"column",gap:"var(--space-1)"}}>
    {items.map(item=>{
     const active=item.id===activeId;
     return (
      <li key={item.id}>
       <a
        href={item.href}
        aria-current={active?"page":undefined}
        style={{
         display:"flex",
         alignItems:"center",
         gap:"var(--space-3)",
         padding:"var(--space-2) var(--space-3)",
         borderRadius:"var(--radius-md)",
         textDecoration:"none",
         color:active?"var(--accent-ink)":"var(--ink)",
         background:active?"var(--accent)":"transparent",
         fontFamily:"var(--font-body)",
         fontSize:14,
         whiteSpace:"nowrap",
         overflow:"hidden",
        }}
       >
        <span aria-hidden="true">{item.icon}</span>
        {!collapsed&&<span>{item.label}</span>}
       </a>
      </li>
     );
    })}
   </ul>
  </nav>
 );
}
