ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS claimed_by text;
CREATE UNIQUE INDEX IF NOT EXISTS publication_jobs_idempotency_key_uidx ON public.publication_jobs (idempotency_key);

CREATE OR REPLACE FUNCTION public.claim_due_schedules(p_limit integer DEFAULT 5)
RETURNS SETOF public.schedules LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.schedules s
  SET claimed_at = now(), claimed_by = 'cron', next_run_at = now() + interval '20 minutes', updated_at = now()
  WHERE s.id IN (
    SELECT id FROM public.schedules
    WHERE enabled = true AND next_run_at IS NOT NULL AND next_run_at <= now()
      AND (claimed_at IS NULL OR claimed_at < now() - interval '12 minutes')
    ORDER BY next_run_at LIMIT GREATEST(1, LEAST(p_limit, 20)) FOR UPDATE SKIP LOCKED
  )
  RETURNING s.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_posts(p_limit integer DEFAULT 10)
RETURNS SETOF public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.posts p
  SET status = 'processing', last_attempt_at = now(), attempt_count = COALESCE(p.attempt_count, 0) + 1
  WHERE p.id IN (
    SELECT id FROM public.posts
    WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= now()
    ORDER BY scheduled_at LIMIT GREATEST(1, LEAST(p_limit, 30)) FOR UPDATE SKIP LOCKED
  )
  RETURNING p.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_topics(p_limit integer DEFAULT 5)
RETURNS SETOF public.topic_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.topic_queue t
  SET status = 'generating', updated_at = now()
  WHERE t.id IN (
    SELECT id FROM public.topic_queue
    WHERE status = 'scheduled_topic' AND scheduled_at <= now()
    ORDER BY scheduled_at LIMIT GREATEST(1, LEAST(p_limit, 20)) FOR UPDATE SKIP LOCKED
  )
  RETURNING t.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_and_claim_publication_job(
  p_user_id uuid, p_post_id uuid, p_target_id uuid, p_schedule_id uuid, p_topic_id uuid,
  p_idempotency_key text, p_scheduled_for timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  job public.publication_jobs;
  claimed public.publication_jobs;
  stale interval := interval '8 minutes';
BEGIN
  INSERT INTO public.publication_jobs (user_id, post_id, target_id, schedule_id, topic_id, idempotency_key, status, scheduled_for)
  VALUES (p_user_id, p_post_id, p_target_id, p_schedule_id, p_topic_id, p_idempotency_key, 'queued', p_scheduled_for)
  ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT * INTO job FROM public.publication_jobs WHERE idempotency_key = p_idempotency_key;

  IF job.status = 'success' AND job.linkedin_post_urn IS NOT NULL THEN
    RETURN jsonb_build_object('action', 'already_success', 'job', to_jsonb(job));
  END IF;
  IF job.status = 'processing' AND job.last_attempt_at IS NOT NULL AND job.last_attempt_at > now() - stale THEN
    RETURN jsonb_build_object('action', 'in_flight', 'job', to_jsonb(job));
  END IF;
  IF job.status = 'failed' AND job.error_code IN (
    'LINKEDIN_TOKEN_EXPIRED','LINKEDIN_NOT_CONNECTED','LINKEDIN_FORBIDDEN','INVALID_CONTENT','IMAGE_REQUIRED','IMAGE_NOT_PERSISTED','TARGET_INVALID'
  ) THEN
    RETURN jsonb_build_object('action', 'terminal_failed', 'job', to_jsonb(job));
  END IF;

  UPDATE public.publication_jobs
  SET status = 'processing', attempt_count = attempt_count + 1, started_at = COALESCE(started_at, now()),
      last_attempt_at = now(), updated_at = now()
  WHERE id = job.id AND (
    status IN ('queued', 'retrying')
    OR (status = 'failed' AND COALESCE(error_code, '') NOT IN (
      'LINKEDIN_TOKEN_EXPIRED','LINKEDIN_NOT_CONNECTED','LINKEDIN_FORBIDDEN','INVALID_CONTENT','IMAGE_REQUIRED','IMAGE_NOT_PERSISTED','TARGET_INVALID'))
    OR (status = 'processing' AND (last_attempt_at IS NULL OR last_attempt_at <= now() - stale))
    OR (status = 'success' AND linkedin_post_urn IS NULL)
  )
  RETURNING * INTO claimed;

  IF claimed.id IS NULL THEN
    SELECT * INTO job FROM public.publication_jobs WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('action', 'in_flight', 'job', to_jsonb(job));
  END IF;

  INSERT INTO public.publication_attempts (publication_job_id, attempt_number, status)
  VALUES (claimed.id, claimed.attempt_count, 'started');

  RETURN jsonb_build_object('action', 'claimed', 'job', to_jsonb(claimed));
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_publication_job(
  p_job_id uuid, p_ok boolean, p_retryable boolean, p_urn text, p_error_code text,
  p_error_message text, p_provider_status integer, p_provider_response jsonb
) RETURNS public.publication_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  job public.publication_jobs;
  next_status text;
BEGIN
  next_status := CASE WHEN p_ok THEN 'success' WHEN p_retryable THEN 'retrying' ELSE 'failed' END;
  UPDATE public.publication_jobs
  SET status = next_status,
      linkedin_post_urn = CASE WHEN p_ok THEN p_urn ELSE linkedin_post_urn END,
      error_code = CASE WHEN p_ok THEN NULL ELSE p_error_code END,
      error_message = CASE WHEN p_ok THEN NULL ELSE p_error_message END,
      completed_at = CASE WHEN p_ok OR NOT p_retryable THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO job;

  UPDATE public.publication_attempts
  SET completed_at = now(), status = CASE WHEN p_ok THEN 'success' ELSE 'failed' END,
      provider_status = p_provider_status, provider_response = p_provider_response, error_message = p_error_message
  WHERE id = (SELECT id FROM public.publication_attempts WHERE publication_job_id = p_job_id ORDER BY attempt_number DESC LIMIT 1);

  RETURN job;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_schedules(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_due_scheduled_posts(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_due_topics(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_and_claim_publication_job(uuid, uuid, uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_publication_job(uuid, boolean, boolean, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_schedules(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_posts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_topics(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_and_claim_publication_job(uuid, uuid, uuid, uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_publication_job(uuid, boolean, boolean, text, text, text, integer, jsonb) TO service_role;
GRANT ALL ON public.publication_jobs TO service_role;
GRANT ALL ON public.publication_attempts TO service_role;
NOTIFY pgrst, 'reload schema';