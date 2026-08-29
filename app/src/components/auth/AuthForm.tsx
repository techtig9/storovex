import React, {useState} from "react";

export function AuthForm(props:{mode:"login"|"signup";onSubmit:(input:{email:string;password:string})=>void;submitting:boolean;error?:string}){
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const isSignup=props.mode==="signup";

 return (
  <form
   onSubmit={e=>{e.preventDefault();props.onSubmit({email,password});}}
   style={{display:"flex",flexDirection:"column",gap:"var(--space-4)",width:"100%",maxWidth:360}}
  >
   <div>
    <label htmlFor="auth-email" style={{display:"block",fontSize:13,marginBottom:"var(--space-1)"}}>Email</label>
    <input id="auth-email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
     style={{width:"100%",padding:"var(--space-2)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",background:"var(--surface)",color:"var(--ink)"}} />
   </div>
   <div>
    <label htmlFor="auth-password" style={{display:"block",fontSize:13,marginBottom:"var(--space-1)"}}>Password</label>
    <input id="auth-password" type="password" required minLength={8}
     autoComplete={isSignup?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)}
     style={{width:"100%",padding:"var(--space-2)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",background:"var(--surface)",color:"var(--ink)"}} />
   </div>
   {props.error&&(
    <p role="alert" style={{margin:0,fontSize:13,color:"var(--accent)"}}>{props.error}</p>
   )}
   <button type="submit" disabled={props.submitting}
    style={{
     padding:"var(--space-3)",background:"var(--accent)",color:"var(--accent-ink)",border:"none",
     borderRadius:"var(--radius-md)",fontFamily:"var(--font-display)",fontWeight:600,
     cursor:props.submitting?"default":"pointer",opacity:props.submitting?0.6:1,
    }}>
    {props.submitting?"Please wait…":isSignup?"Create account":"Log in"}
   </button>
  </form>
 );
}
