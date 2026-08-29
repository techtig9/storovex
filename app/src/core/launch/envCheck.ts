
export const REQUIRED_ENV_VARS=[
 "NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY",
 "PADDLE_API_KEY","PADDLE_WEBHOOK_SECRET",
 "RESEND_API_KEY",
 "GEMINI_API_KEY","CEREBRAS_API_KEY","OPENROUTER_API_KEY",
] as const;

export type RequiredEnvVar=typeof REQUIRED_ENV_VARS[number];

export function missingEnvVars(env:Record<string,string|undefined>){
 return REQUIRED_ENV_VARS.filter(k=>!env[k]||env[k]?.trim()==="");
}

export function assertEnvComplete(env:Record<string,string|undefined>){
 const missing=missingEnvVars(env);
 if(missing.length>0)throw new Error(`ENV_VARS_MISSING: ${missing.join(",")}`);
 return true;
}
