"use client";
import React, {useState} from "react";
import {AuthForm} from "../../../components/auth/AuthForm";

export default function SignupPage(){
 const [submitting,setSubmitting]=useState(false);
 const [error,setError]=useState<string|undefined>();

 async function handleSubmit(input:{email:string;password:string}){
  setSubmitting(true);
  setError(undefined);
  try{
   // See the matching comment in login/page.tsx: wire this to Supabase Auth
   // (supabase.auth.signUp) once your browser client is merged in.
   const res=await fetch("/api/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
   if(!res.ok)throw new Error("Couldn't create your account. That email may already be in use.");
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
    <h1 style={{fontFamily:"var(--font-display)",fontSize:24,marginBottom:"var(--space-4)"}}>Create your account</h1>
    <AuthForm mode="signup" onSubmit={handleSubmit} submitting={submitting} error={error} />
    <p style={{marginTop:"var(--space-4)",fontSize:13,color:"var(--ink-muted)"}}>
     Already have an account? <a href="/login" style={{color:"var(--accent)"}}>Log in</a>
    </p>
   </div>
  </div>
 );
}
