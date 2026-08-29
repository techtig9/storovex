"use client";
import React, {useState} from "react";
import {AuthForm} from "../../../components/auth/AuthForm";

export default function LoginPage(){
 const [submitting,setSubmitting]=useState(false);
 const [error,setError]=useState<string|undefined>();

 async function handleSubmit(input:{email:string;password:string}){
  setSubmitting(true);
  setError(undefined);
  try{
   // Wire this to Supabase Auth once the browser client from your earlier phases is
   // merged in (supabase.auth.signInWithPassword), or point this fetch at a server
   // route built on top of it. Left as a clearly-marked integration point rather
   // than a fabricated client, since this codebase's session handling (session.ts)
   // already assumes a specific Supabase client setup this zip doesn't include.
   const res=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
   if(!res.ok)throw new Error("Couldn't log you in. Check your email and password.");
   window.location.href="/dashboard";
  }catch(e){
   setError(e instanceof Error?e.message:"Something went wrong. Try again.");
  }finally{
   setSubmitting(false);
  }
 }

 return (
  <div data-theme="daylight" style={{background:"var(--bg)",color:"var(--ink)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"var(--space-8)"}}>
   <div>
    <h1 style={{fontFamily:"var(--font-display)",fontSize:24,marginBottom:"var(--space-4)"}}>Log in</h1>
    <AuthForm mode="login" onSubmit={handleSubmit} submitting={submitting} error={error} />
    <p style={{marginTop:"var(--space-4)",fontSize:13,color:"var(--ink-muted)"}}>
     New here? <a href="/signup" style={{color:"var(--accent)"}}>Create an account</a>
    </p>
   </div>
  </div>
 );
}
