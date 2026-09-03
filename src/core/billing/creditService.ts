import {createServiceRoleSupabase} from "@/core/supabase/server";
import {InsufficientCreditsError} from "./creditLedger";
import {maxSpendPerJob, type PlanId} from "./plans";

/**
 * Thin wrappers over the atomic Postgres functions in migration 11.
 *
 * The previous implementation read the balance, checked it in JavaScript, inserted a
 * ledger row, then updated the balance in a separate statement. Two concurrent
 * requests both passed the check, and a failure between the two writes left the
 * ledger and the balance permanently disagreeing. All of that logic now lives in one
 * locked transaction inside the database; these functions only translate results.
 */

export class LedgerError extends Error {
  constructor(readonly code: string) { super(code); }
}

type RpcResult = {ok: boolean; error?: string; [k: string]: unknown};

async function callLedgerFn(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const supabase = createServiceRoleSupabase();
  const {data, error} = await supabase.rpc(name, args);
  if (error) throw new LedgerError(`LEDGER_RPC_FAILED: ${name}`);
  return data as RpcResult;
}

export async function reserveJobCredits(input: {
  accountId: string; planId: PlanId; jobId: string; amount: number; idempotencyKey: string;
}) {
  const result = await callLedgerFn("reserve_credits", {
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_job_id: input.jobId,
    p_idempotency_key: input.idempotencyKey,
    p_max_per_job: maxSpendPerJob(input.planId),
  });

  if (!result.ok) {
    if (result.error === "INSUFFICIENT_CREDITS") throw new InsufficientCreditsError();
    throw new LedgerError(result.error ?? "LEDGER_RESERVE_FAILED");
  }
  return {
    balance: result.balance as number,
    reserved: result.reserved as number,
    // A replayed idempotency key is a success, not an error: the caller retried.
    duplicate: result.duplicate === true,
  };
}

export async function commitJobCredits(input: {accountId: string; jobId: string; actualAmount: number}) {
  const result = await callLedgerFn("commit_credits", {
    p_account_id: input.accountId, p_job_id: input.jobId, p_actual_amount: input.actualAmount,
  });
  if (!result.ok) throw new LedgerError(result.error ?? "LEDGER_COMMIT_FAILED");
  return {committed: result.committed as number, refunded: result.refunded as number, balance: result.balance as number};
}

export async function refundJobCredits(input: {accountId: string; jobId: string; reason?: string}) {
  const result = await callLedgerFn("refund_credits", {
    p_account_id: input.accountId, p_job_id: input.jobId,
    p_reason: input.reason ?? "generation failed",
  });
  // A job that already settled is not an error worth failing the caller over — it
  // means a retry raced us, and the credits are already where they should be.
  if (!result.ok && result.error === "LEDGER_JOB_ALREADY_SETTLED") {
    return {refunded: 0, alreadySettled: true};
  }
  if (!result.ok) throw new LedgerError(result.error ?? "LEDGER_REFUND_FAILED");
  return {refunded: result.refunded as number, alreadySettled: false};
}

export async function grantCredits(input: {
  accountId: string; amount: number; idempotencyKey: string; reason?: string;
}) {
  const result = await callLedgerFn("grant_credits", {
    p_account_id: input.accountId, p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey, p_reason: input.reason ?? "plan grant",
  });
  if (!result.ok) throw new LedgerError(result.error ?? "LEDGER_GRANT_FAILED");
  return {granted: result.granted as number, duplicate: result.duplicate === true, balance: result.balance as number};
}

export {InsufficientCreditsError};
