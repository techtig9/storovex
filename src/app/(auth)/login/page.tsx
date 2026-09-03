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
   const res=await fetch("/api/auth/login",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),
   });
   if(!res.ok){
    const body=await res.json().catch(()=>null);
    throw new Error(body?.error?.message??"Couldn't log you in. Check your email and password.");
   }
   // Read the post-login destination from the URL the middleware redirected us with.
   // Only a same-origin path survives, so this can't be turned into an open redirect.
   const next=new URLSearchParams(window.location.search).get("next");
   const safe=next&&next.startsWith("/")&&!next.startsWith("//")?next:"/dashboard";
   window.location.assign(safe);
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
