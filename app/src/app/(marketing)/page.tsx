import React from "react";

const FRAMES=[
 {tag:"f/2.8 · hero",note:"Clean product hero"},
 {tag:"f/4 · lifestyle",note:"In-context scene"},
 {tag:"f/5.6 · campaign",note:"Seasonal campaign"},
 {tag:"f/4 · collection",note:"Full collection grid"},
 {tag:"f/2.8 · banner",note:"Storefront banner"},
 {tag:"f/5.6 · social",note:"Social creative"},
];

const STEPS=[
 {frame:"01",title:"Upload",body:"Give it one reference photo of the product, taken however you can — phone, tripod, doesn't matter."},
 {frame:"02",title:"Direction",body:"Tell it the shot types and the mood: bright and minimal, warm and editorial, or your existing brand style."},
 {frame:"03",title:"Delivery",body:"Get back a full set, sized and ready for your product pages, ads, and social posts."},
];

export default function MarketingHomePage(){
 return (
  <div data-theme="daylight" style={{background:"var(--bg)",color:"var(--ink)",minHeight:"100vh",fontFamily:"var(--font-body)"}}>
   <a href="#main-content" className="skip-link">Skip to content</a>
   <header style={{
    display:"flex",alignItems:"center",justifyContent:"space-between",
    padding:"var(--space-4) var(--space-8)",borderBottom:"1px solid var(--border)",
   }}>
    <span style={{fontFamily:"var(--font-display)",fontWeight:700,letterSpacing:"0.02em"}}>STOROVEX</span>
    <nav aria-label="Site" style={{display:"flex",gap:"var(--space-6)",alignItems:"center",fontSize:14}}>
     <a href="/pricing" style={{color:"var(--ink)",textDecoration:"none"}}>Pricing</a>
     <a href="/login" style={{color:"var(--ink)",textDecoration:"none"}}>Log in</a>
     <a href="/signup" style={{
      background:"var(--accent)",color:"var(--accent-ink)",padding:"var(--space-2) var(--space-4)",
      borderRadius:"var(--radius-md)",textDecoration:"none",fontWeight:600,
     }}>Start free</a>
    </nav>
   </header>

   <main id="main-content" tabIndex={-1}>
    <section style={{padding:"var(--space-12) var(--space-8)",maxWidth:920}}>
     <p style={{
      fontFamily:"var(--font-mono)",fontSize:12,letterSpacing:"0.08em",textTransform:"uppercase",
      color:"var(--accent)",margin:0,
     }}>
      One upload → full shoot
     </p>
     <h1 style={{
      fontFamily:"var(--font-display)",fontWeight:600,fontSize:"clamp(32px, 5vw, 56px)",
      lineHeight:1.05,margin:"var(--space-3) 0 0",maxWidth:760,
     }}>
      Your product, shot a dozen ways — without a studio.
     </h1>
     <p style={{fontSize:18,color:"var(--ink-muted)",maxWidth:560,margin:"var(--space-4) 0 0",lineHeight:1.5}}>
      Upload one reference photo. Storovex generates hero shots, lifestyle scenes, and campaign
      creative in your store&rsquo;s style — ready to publish, not just a first draft.
     </p>
     <div style={{display:"flex",gap:"var(--space-3)",marginTop:"var(--space-6)"}}>
      <a href="/signup" style={{
       background:"var(--accent)",color:"var(--accent-ink)",padding:"var(--space-3) var(--space-6)",
       borderRadius:"var(--radius-md)",textDecoration:"none",fontWeight:600,fontFamily:"var(--font-display)",
      }}>Start generating</a>
      <a href="/pricing" style={{
       border:"1px solid var(--border)",padding:"var(--space-3) var(--space-6)",
       borderRadius:"var(--radius-md)",textDecoration:"none",color:"var(--ink)",fontWeight:600,
      }}>See pricing</a>
     </div>
    </section>

    <section aria-label="Example output frames" style={{padding:"0 var(--space-8) var(--space-12)"}}>
     <div style={{
      display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:"var(--space-2)",
      background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--radius-lg)",padding:"var(--space-3)",
     }}>
      {FRAMES.map((f,i)=>(
       <div key={f.tag} style={{
        aspectRatio:"4 / 5",background:"var(--surface-2)",borderRadius:"var(--radius-md)",
        display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"var(--space-2)",
       }}>
        <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--ink-muted)"}}>
         frame {String(i+1).padStart(2,"0")} · {f.tag}
        </span>
        <span style={{fontSize:12,fontWeight:600}}>{f.note}</span>
       </div>
      ))}
     </div>
    </section>

    <section aria-label="How it works" style={{padding:"var(--space-8) var(--space-8) var(--space-12)",borderTop:"1px solid var(--border)"}}>
     <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:"var(--space-8)",maxWidth:920}}>
      {STEPS.map(step=>(
       <div key={step.frame}>
        <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--accent)"}}>Frame {step.frame}</span>
        <h2 style={{fontFamily:"var(--font-display)",fontSize:20,margin:"var(--space-2) 0"}}>{step.title}</h2>
        <p style={{fontSize:14,color:"var(--ink-muted)",lineHeight:1.5,margin:0}}>{step.body}</p>
       </div>
      ))}
     </div>
    </section>
   </main>

   <footer style={{padding:"var(--space-6) var(--space-8)",borderTop:"1px solid var(--border)",fontSize:13,color:"var(--ink-muted)"}}>
    Storovex — AI product photography for online stores.
   </footer>
  </div>
 );
}
