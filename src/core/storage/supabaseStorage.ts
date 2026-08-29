
import {createServerClient, type CookieOptions} from "@supabase/ssr";
import {createClient} from "@supabase/supabase-js";
import {cookies} from "next/headers";

// This is the standard @supabase/ssr server-client pattern for the Next.js App
// Router: session state lives in cookies, read/written per-request. Every service
// file in this codebase (session.ts, uploadService.ts, creditService.ts, etc.)
// already assumes a client shaped exactly like this (`.from()`, `.auth`, `.storage`,
// `.rpc()`), which is why this is a drop-in rather than a guess at a custom shape.
//
// If your fuller project already has its own version of this file (likely, since
// it predates Phase 74 in your history), prefer that one — this exists so the
// zip is self-contained and every test/typecheck in it passes as delivered.
export function createServerStorageClient(){
 const cookieStore=cookies();
 return createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
   cookies:{
    get(name:string){
     return cookieStore.get(name)?.value;
    },
    set(name:string,value:string,options:CookieOptions){
     try{cookieStore.set({name,value,...options});}catch{
      // Called from a Server Component with no request context to write to;
      // safe to ignore as long as middleware refreshes the session cookie.
     }
    },
    remove(name:string,options:CookieOptions){
     try{cookieStore.set({name,value:"",...options});}catch{
      // Same as above.
     }
    },
   },
  }
 );
}

// A service-role client bypasses RLS. Only use it for genuinely trusted,
// server-only operations (webhook handlers, admin routes) that must act
// outside a specific user's row-level policies.
export function createServiceRoleClient(){
 return createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {auth:{autoRefreshToken:false,persistSession:false}}
 );
}
