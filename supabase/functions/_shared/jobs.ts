import { jobLog } from "./logger.ts";

export type ClaimAction = "claimed" | "already_success" | "in_flight" | "terminal_failed";

export type PublicationJob = {
  id: string;
  user_id: string;
  post_id: string | null;
  target_id: string | null;
  schedule_id: string | null;
  topic_id: string | null;
  idempotency_key: string;
  status: string;
  attempt_count: number;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  linkedin_post_urn: string | null;
  error_code: string | null;
  error_message: string | null;
  last_attempt_at: string | null;
};

export async function upsertAndClaimJob(supabase: any, args: {
  userId: string;
  postId?: string | null;
  targetId: string;
  scheduleId?: string | null;
  topicId?: string | null;
  idempotencyKey: string;
  scheduledFor?: string | null;
}): Promise<{ action: ClaimAction; job: PublicationJob }> {
  const { data, error } = await supabase.rpc("upsert_and_claim_publication_job", {
    p_user_id: args.userId,
    p_post_id: args.postId ?? null,
    p_target_id: args.targetId,
    p_schedule_id: args.scheduleId ?? null,
    p_topic_id: args.topicId ?? null,
    p_idempotency_key: args.idempotencyKey,
    p_scheduled_for: args.scheduledFor ?? null,
  });
  if (error) throw new Error(`claim job failed: ${error.message}`);
  const action = (data?.action ?? "in_flight") as ClaimAction;
  const job = data?.job as PublicationJob;
  jobLog("JOB_CLAIM", { action, job: job?.id, key: args.idempotencyKey, target: args.targetId });
  return { action, job };
}

export async function finalizeJob(supabase: any, args: {
  jobId: string;
  ok: boolean;
  retryable: boolean;
  urn?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  providerStatus?: number | null;
  providerResponse?: Record<string, unknown> | null;
}): Promise<PublicationJob> {
  const { data, error } = await supabase.rpc("finalize_publication_job", {
    p_job_id: args.jobId,
    p_ok: args.ok,
    p_retryable: args.retryable,
    p_urn: args.urn ?? null,
    p_error_code: args.errorCode ?? null,
    p_error_message: args.errorMessage ?? null,
    p_provider_status: args.providerStatus ?? null,
    p_provider_response: args.providerResponse ?? null,
  });
  if (error) throw new Error(`finalize job failed: ${error.message}`);
  jobLog(args.ok ? "JOB_SUCCESS" : args.retryable ? "JOB_RETRYING" : "JOB_FAILED", {
    job: args.jobId,
    urn: args.urn ?? undefined,
    code: args.errorCode ?? undefined,
  });
  return data as PublicationJob;
}

export async function claimDueSchedules(supabase: any, limit = 5) {
  const { data, error } = await supabase.rpc("claim_due_schedules", { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

export async function claimDueScheduledPosts(supabase: any, limit = 10) {
  const { data, error } = await supabase.rpc("claim_due_scheduled_posts", { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

export async function claimDueTopics(supabase: any, limit = 5) {
  const { data, error } = await supabase.rpc("claim_due_topics", { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}
