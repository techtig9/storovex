import {createServiceRoleSupabase} from "@/core/supabase/server";
import {spendCredits, commitCredits, refundCredits} from "./creditService";
import {callWithResilience} from "./resilience";
import {cerebrasChat} from "./providers/chat";
import type {FetchLike} from "./providers/types";

/**
 * The merchant-facing AI assistant.
 *
 * assistant_messages carries a `sequence bigint`, so the conversation is an ordered
 * stream per store rather than a set of rows with timestamps. Ordering by created_at
 * would be ambiguous for two messages written in the same millisecond, which is
 * exactly what happens when a reply is stored immediately after a question.
 */

// assistant_messages.role is constrained to these two. The system prompt is sent to
// the model as a separate field and is never stored, so it is not a role here.
export type AssistantRole = "user" | "assistant";
const MAX_CONTEXT_MESSAGES = 20;

/** Next sequence number for a store, so ordering is explicit rather than inferred. */
async function nextSequence(storeId: string): Promise<number> {
  const supabase = createServiceRoleSupabase();
  const {data} = await supabase
    .from("assistant_messages").select("sequence")
    .eq("store_id", storeId).order("sequence", {ascending: false}).limit(1).maybeSingle();
  return ((data?.sequence as number | undefined) ?? 0) + 1;
}

export async function loadConversation(storeId: string, limit = MAX_CONTEXT_MESSAGES) {
  const supabase = createServiceRoleSupabase();
  const {data} = await supabase
    .from("assistant_messages").select("id,sequence,role,content,created_at")
    .eq("store_id", storeId).order("sequence", {ascending: false}).limit(limit);
  // Fetched newest-first for the limit, returned oldest-first for reading.
  return (data ?? []).reverse();
}

/**
 * Builds the system prompt from the merchant's actual catalogue.
 *
 * Grounding the assistant in real data is what stops it inventing products the
 * merchant does not sell — the failure mode that makes an assistant worse than no
 * assistant.
 */
async function buildSystemPrompt(storeId: string): Promise<string> {
  const supabase = createServiceRoleSupabase();
  const [{data: store}, {data: products}, {count: orderCount}] = await Promise.all([
    supabase.from("stores").select("name").eq("id", storeId).maybeSingle(),
    supabase.from("products").select("title,status").eq("store_id", storeId).limit(50),
    supabase.from("orders").select("id", {count: "exact", head: true}).eq("store_id", storeId),
  ]);

  const published = (products ?? []).filter(p => p.status === "active").map(p => p.title);
  const drafts = (products ?? []).filter(p => p.status === "draft").length;

  return [
    `You are the Storovex assistant, helping the merchant who runs "${store?.name ?? "this store"}".`,
    published.length
      ? `Their published products are: ${published.join(", ")}.`
      : "They have no published products yet.",
    drafts > 0 ? `They also have ${drafts} product(s) in draft.` : "",
    `They have received ${orderCount ?? 0} order(s).`,
    "Answer using only what you are told here. If you do not know something about their",
    "store, say so and suggest where in Storovex they can find it. Never invent products,",
    "orders, figures or features.",
  ].filter(Boolean).join(" ");
}

/**
 * One turn of conversation: charge, call, store, settle.
 *
 * The user's message is stored before the model is called, so a failed reply still
 * leaves the merchant's question in the thread rather than losing what they typed.
 */
export async function sendAssistantMessage(input: {
  storeId: string; content: string;
}, opts: {fetchImpl?: FetchLike; chat?: typeof cerebrasChat} = {}) {
  const supabase = createServiceRoleSupabase();
  const chat = opts.chat ?? cerebrasChat;

  const userSequence = await nextSequence(input.storeId);
  await supabase.from("assistant_messages").insert({
    store_id: input.storeId, sequence: userSequence, role: "user", content: input.content,
  });

  const {usageId} = await spendCredits({storeId: input.storeId, feature: "ai_assistant_message"});

  try {
    const history = await loadConversation(input.storeId);
    const system = await buildSystemPrompt(input.storeId);

    const transcript = history
      .map(m => `${m.role === "user" ? "Merchant" : "Assistant"}: ${m.content}`)
      .join("\n");

    const result = await callWithResilience("cerebras", () => chat({
      prompt: transcript, system, maxTokens: 800, temperature: 0.4,
    }, {fetchImpl: opts.fetchImpl}));

    await supabase.from("assistant_messages").insert({
      store_id: input.storeId, sequence: userSequence + 1,
      role: "assistant", content: result.text,
    });
    await commitCredits(usageId).catch(() => undefined);

    return {reply: result.text, sequence: userSequence + 1};
  } catch (e) {
    // No reply was produced, so the merchant should not pay for the turn.
    await refundCredits(usageId, "assistant reply failed").catch(() => undefined);
    throw e;
  }
}
