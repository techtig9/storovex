
export type ChatProvider="cerebras"|"openrouter";
export type GenerationProvider="gemini";
export type DifficultProvider="claude";

// Normal conversation: Cerebras first; fall back to OpenRouter only on a
// recoverable failure (rate limit / timeout / provider outage), never on auth/validation.
export function routeConversation(cerebrasFailed:boolean,cerebrasErrorClass?:"rate_limit"|"timeout"|"provider_outage"|"auth"|"validation"|"permanent"):ChatProvider{
 if(!cerebrasFailed)return "cerebras";
 const recoverable=cerebrasErrorClass==="rate_limit"||cerebrasErrorClass==="timeout"||cerebrasErrorClass==="provider_outage";
 if(!recoverable)throw new Error("CEREBRAS_UNRECOVERABLE_NO_FALLBACK");
 return "openrouter";
}

// Generation workloads always use the configured Gemini generation model;
// generation routing is intentionally isolated from chat routing.
export function routeGeneration():GenerationProvider{return "gemini"}

export type ComplexityLevel="normal"|"complex";
export function classifyComplexity(input:{estimatedTokens:number;requiresLongContext:boolean;requiresPlanning:boolean}):ComplexityLevel{
 if(input.requiresLongContext||input.requiresPlanning||input.estimatedTokens>8000)return "complex";
 return "normal";
}

// Difficult/bigger tasks route to Claude only when configured and policy permits;
// otherwise fall back to the general provider used for normal conversation.
export function routeDifficultTask(complexity:ComplexityLevel,claudeConfigured:boolean,fallback:ChatProvider):DifficultProvider|ChatProvider{
 if(complexity==="complex"&&claudeConfigured)return "claude";
 return fallback;
}
