"use client";
import React, {useState} from "react";
import {AuthForm} from "../../../components/auth/AuthForm";

export default function SignupPage(){
 const [submitting,setSubmitting]=useState(false);
 const [error,setError]=useState<string|undefined>();
 const [notice,setNotice]=useState<string|undefined>();

 async function handleSubmit(input:{email:string;password:string}){
  setSubmitting(true);
  setError(undefined);
  try{
   // See the matching comment in login/page.tsx: wire this to Supabase Auth
   // (supabase.auth.signUp) once your browser client is merged in.
   const res=await fetch("/api/auth/signup",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),
   });
   const body=await res.json().catch(()=>null);
   if(!res.ok)throw new Error(body?.error?.message??"We couldn't create that account.");
   // Signup deliberately does not sign the user in: Supabase sends a confirmation
   // email first. Showing the same message whether or not the address already has an
   // account is what stops signup being used to test which emails are registered.
   setNotice(body?.data?.message??"Check your email to confirm your account.");
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
    {notice&&<p role="status" style={{marginBottom:"var(--space-4)",fontSize:14}}>{notice}</p>}
    <AuthForm mode="signup" onSubmit={handleSubmit} submitting={submitting} error={error} />
    <p style={{marginTop:"var(--space-4)",fontSize:13,color:"var(--ink-muted)"}}>
     Already have an account? <a href="/login" style={{color:"var(--accent)"}}>Log in</a>
    </p>
   </div>
  </div>
 );
}
