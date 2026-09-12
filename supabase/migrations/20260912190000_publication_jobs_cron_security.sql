-- Publication jobs, atomic claiming, cron bootstrap, secret-column lockdown.
-- posts.status now includes scheduled/queued/processing/retrying.

-- 1. Fix posts.status CHECK (legacy constraint never allowed 'scheduled')
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN (
    'draft', 'generating', 'ready', 'scheduled', 'queued',
    'processing', 'retrying', 'published', 'failed'
  ));

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- 2. Schedule claim lock (prevents double cron execution)
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS claimed_by text;

-- 3. Secret-configured flags (readable) without exposing secret values
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_linkedin_client_secret boolean
    GENERATED ALWAYS AS (linkedin_client_secret IS NOT NULL AND linkedin_client_secret <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_openai_api_key boolean
    GENERATED ALWAYS AS (openai_api_key IS NOT NULL AND openai_api_key <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_gemini_api_key boolean
    GENERATED ALWAYS AS (gemini_api_key IS NOT NULL AND gemini_api_key <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_anthropic_api_key boolean
    GENERATED ALWAYS AS (anthropic_api_key IS NOT NULL AND anthropic_api_key <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_mistral_api_key boolean
    GENERATED ALWAYS AS (mistral_api_key IS NOT NULL AND mistral_api_key <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_groq_api_key boolean
    GENERATED ALWAYS AS (groq_api_key IS NOT NULL AND groq_api_key <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_deepseek_api_key boolean
    GENERATED ALWAYS AS (deepseek_api_key IS NOT NULL AND deepseek_api_key <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_xai_api_key boolean
    GENERATED ALWAYS AS (xai_api_key IS NOT NULL AND xai_api_key <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_perplexity_api_key boolean
    GENERATED ALWAYS AS (perplexity_api_key IS NOT NULL AND perplexity_api_key <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_openrouter_api_key boolean
    GENERATED ALWAYS AS (openrouter_api_key IS NOT NULL AND openrouter_api_key <> '') STORED;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_firecrawl_api_key boolean
    GENERATED ALWAYS AS (firecrawl_api_key IS NOT NULL AND firecrawl_api_key <> '') STORED;

-- 4. publication_jobs
CREATE TABLE IF NOT EXISTS public.publication_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  target_id uuid REFERENCES public.linkedin_targets(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.topic_queue(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'retrying', 'success', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  linkedin_post_urn text,
  error_code text,
  error_message text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS publication_jobs_status_idx
  ON public.publication_jobs (status, last_attempt_at);
CREATE INDEX IF NOT EXISTS publication_jobs_user_idx
  ON public.publication_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS publication_jobs_post_idx
  ON public.publication_jobs (post_id);

-- 5. publication_attempts
CREATE TABLE IF NOT EXISTS public.publication_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_job_id uuid NOT NULL REFERENCES public.publication_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  provider_status integer,
  provider_response jsonb,
  error_message text
);

CREATE INDEX IF NOT EXISTS publication_attempts_job_idx
  ON public.publication_attempts (publication_job_id, attempt_number);

-- 6. automation_config (service role / definer functions only)
CREATE TABLE IF NOT EXISTS public.automation_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  supabase_url text,
  cron_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.publication_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY publication_jobs_select_own
  ON public.publication_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY publication_attempts_select_own
  ON public.publication_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.publication_jobs j
      WHERE j.id = publication_job_id AND j.user_id = auth.uid()
    )
  );

-- no client writes on jobs/attempts/config
CREATE POLICY automation_config_deny
  ON public.automation_config FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.publication_jobs FROM anon;
REVOKE ALL ON public.publication_attempts FROM anon;
REVOKE ALL ON public.automation_config FROM anon, authenticated;
GRANT SELECT ON public.publication_jobs TO authenticated;
GRANT SELECT ON public.publication_attempts TO authenticated;

-- 7. Hide secrets from authenticated SELECT; keep write-only updates
REVOKE SELECT ON public.user_settings FROM authenticated, anon;
GRANT SELECT (
  user_id,
  linkedin_client_id,
  linkedin_organization_id,
  linkedin_person_urn,
  linkedin_token_expires_at,
  post_model,
  image_model,
  use_byok,
  tone_instructions,
  created_at,
  updated_at,
  has_linkedin_client_secret,
  has_openai_api_key,
  has_gemini_api_key,
  has_anthropic_api_key,
  has_mistral_api_key,
  has_groq_api_key,
  has_deepseek_api_key,
  has_xai_api_key,
  has_perplexity_api_key,
  has_openrouter_api_key,
  has_firecrawl_api_key
) ON public.user_settings TO authenticated;

REVOKE UPDATE ON public.user_settings FROM authenticated;
GRANT UPDATE (
  linkedin_client_id,
  linkedin_client_secret,
  linkedin_organization_id,
  post_model,
  image_model,
  use_byok,
  tone_instructions,
  openai_api_key,
  gemini_api_key,
  anthropic_api_key,
  mistral_api_key,
  groq_api_key,
  deepseek_api_key,
  xai_api_key,
  perplexity_api_key,
  openrouter_api_key,
  firecrawl_api_key,
  updated_at
) ON public.user_settings TO authenticated;

-- Tokens on targets: clients cannot write them
REVOKE INSERT ON public.linkedin_targets FROM authenticated;
REVOKE UPDATE ON public.linkedin_targets FROM authenticated;
GRANT UPDATE (name, avatar_url, is_default, status, updated_at)
  ON public.linkedin_targets TO authenticated;

-- 8. Atomic claim helpers (service_role / security definer)
CREATE OR REPLACE FUNCTION public.claim_due_schedules(p_limit integer DEFAULT 5)
RETURNS SETOF public.schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.schedules s
  SET
    claimed_at = now(),
    claimed_by = 'cron',
    -- temporary bump so a concurrent tick cannot re-select this row
    next_run_at = now() + interval '20 minutes',
    updated_at = now()
  WHERE s.id IN (
    SELECT id FROM public.schedules
    WHERE enabled = true
      AND next_run_at IS NOT NULL
      AND next_run_at <= now()
      AND (claimed_at IS NULL OR claimed_at < now() - interval '12 minutes')
    ORDER BY next_run_at
    LIMIT GREATEST(1, LEAST(p_limit, 20))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING s.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_posts(p_limit integer DEFAULT 10)
RETURNS SETOF public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.posts p
  SET
    status = 'processing',
    last_attempt_at = now(),
    attempt_count = COALESCE(p.attempt_count, 0) + 1
  WHERE p.id IN (
    SELECT id FROM public.posts
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT GREATEST(1, LEAST(p_limit, 30))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING p.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_topics(p_limit integer DEFAULT 5)
RETURNS SETOF public.topic_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.topic_queue t
  SET status = 'generating', updated_at = now()
  WHERE t.id IN (
    SELECT id FROM public.topic_queue
    WHERE status = 'scheduled_topic'
      AND scheduled_at <= now()
    ORDER BY scheduled_at
    LIMIT GREATEST(1, LEAST(p_limit, 20))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING t.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_and_claim_publication_job(
  p_user_id uuid,
  p_post_id uuid,
  p_target_id uuid,
  p_schedule_id uuid,
  p_topic_id uuid,
  p_idempotency_key text,
  p_scheduled_for timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.publication_jobs;
  claimed public.publication_jobs;
  stale interval := interval '8 minutes';
BEGIN
  INSERT INTO public.publication_jobs (
    user_id, post_id, target_id, schedule_id, topic_id,
    idempotency_key, status, scheduled_for
  ) VALUES (
    p_user_id, p_post_id, p_target_id, p_schedule_id, p_topic_id,
    p_idempotency_key, 'queued', p_scheduled_for
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT * INTO job FROM public.publication_jobs WHERE idempotency_key = p_idempotency_key;

  IF job.status = 'success' AND job.linkedin_post_urn IS NOT NULL THEN
    RETURN jsonb_build_object('action', 'already_success', 'job', to_jsonb(job));
  END IF;

  IF job.status = 'processing' AND job.last_attempt_at IS NOT NULL AND job.last_attempt_at > now() - stale THEN
    RETURN jsonb_build_object('action', 'in_flight', 'job', to_jsonb(job));
  END IF;

  IF job.status = 'failed' AND job.error_code IN (
    'LINKEDIN_TOKEN_EXPIRED', 'LINKEDIN_NOT_CONNECTED', 'LINKEDIN_FORBIDDEN',
    'INVALID_CONTENT', 'IMAGE_REQUIRED', 'IMAGE_NOT_PERSISTED', 'TARGET_INVALID'
  ) THEN
    RETURN jsonb_build_object('action', 'terminal_failed', 'job', to_jsonb(job));
  END IF;

  UPDATE public.publication_jobs
  SET
    status = 'processing',
    attempt_count = attempt_count + 1,
    started_at = COALESCE(started_at, now()),
    last_attempt_at = now(),
    updated_at = now()
  WHERE id = job.id
    AND (
      status IN ('queued', 'retrying')
      OR (status = 'failed' AND error_code NOT IN (
        'LINKEDIN_TOKEN_EXPIRED', 'LINKEDIN_NOT_CONNECTED', 'LINKEDIN_FORBIDDEN',
        'INVALID_CONTENT', 'IMAGE_REQUIRED', 'IMAGE_NOT_PERSISTED', 'TARGET_INVALID'
      ))
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
  p_job_id uuid,
  p_ok boolean,
  p_retryable boolean,
  p_urn text,
  p_error_code text,
  p_error_message text,
  p_provider_status integer,
  p_provider_response jsonb
) RETURNS public.publication_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.publication_jobs;
  next_status text;
BEGIN
  next_status := CASE
    WHEN p_ok THEN 'success'
    WHEN p_retryable THEN 'retrying'
    ELSE 'failed'
  END;

  UPDATE public.publication_jobs
  SET
    status = next_status,
    linkedin_post_urn = CASE WHEN p_ok THEN p_urn ELSE linkedin_post_urn END,
    error_code = CASE WHEN p_ok THEN NULL ELSE p_error_code END,
    error_message = CASE WHEN p_ok THEN NULL ELSE p_error_message END,
    completed_at = CASE WHEN p_ok OR NOT p_retryable THEN now() ELSE completed_at END,
    updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO job;

  UPDATE public.publication_attempts
  SET
    completed_at = now(),
    status = CASE WHEN p_ok THEN 'success' ELSE 'failed' END,
    provider_status = p_provider_status,
    provider_response = p_provider_response,
    error_message = p_error_message
  WHERE id = (
    SELECT id FROM public.publication_attempts
    WHERE publication_job_id = p_job_id
    ORDER BY attempt_number DESC
    LIMIT 1
  );

  RETURN job;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_automation_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  jobs jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'jobid', jobid,
    'jobname', jobname,
    'schedule', schedule,
    'active', active,
    'command', left(command, 180)
  ) ORDER BY jobname), '[]'::jsonb)
  INTO jobs
  FROM cron.job
  WHERE jobname LIKE 'mpp-%';
  RETURN jobs;
EXCEPTION
  WHEN undefined_table THEN
    RETURN '[]'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_automation_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net
AS $$
DECLARE
  cfg public.automation_config;
  existing_name text;
BEGIN
  SELECT * INTO cfg FROM public.automation_config WHERE id = 1;
  IF cfg.supabase_url IS NULL OR cfg.cron_secret IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'automation_config incomplete');
  END IF;

  FOR existing_name IN SELECT jobname FROM cron.job WHERE jobname LIKE 'mpp-%'
  LOOP
    PERFORM cron.unschedule(existing_name);
  END LOOP;

  PERFORM cron.schedule(
    'mpp-publish-scheduled',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body := '{"source":"pg_cron"}'::jsonb
      );$cmd$,
      rtrim(cfg.supabase_url, '/') || '/functions/v1/publish-scheduled',
      cfg.cron_secret
    )
  );

  PERFORM cron.schedule(
    'mpp-run-schedules',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body := '{"source":"pg_cron"}'::jsonb
      );$cmd$,
      rtrim(cfg.supabase_url, '/') || '/functions/v1/run-schedules',
      cfg.cron_secret
    )
  );

  PERFORM cron.schedule(
    'mpp-run-topic-queue',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', %L),
        body := '{"source":"pg_cron"}'::jsonb
      );$cmd$,
      rtrim(cfg.supabase_url, '/') || '/functions/v1/run-topic-queue',
      cfg.cron_secret
    )
  );

  RETURN jsonb_build_object('ok', true, 'jobs', public.list_automation_cron());
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_automation_config(p_url text, p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.automation_config (id, supabase_url, cron_secret, updated_at)
  VALUES (1, p_url, p_secret, now())
  ON CONFLICT (id) DO UPDATE
    SET supabase_url = EXCLUDED.supabase_url,
        cron_secret = EXCLUDED.cron_secret,
        updated_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_schedules(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_due_scheduled_posts(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_due_topics(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_and_claim_publication_job(uuid, uuid, uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_publication_job(uuid, boolean, boolean, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_automation_cron() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_automation_config(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_automation_cron() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_due_schedules(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_posts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_topics(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_and_claim_publication_job(uuid, uuid, uuid, uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_publication_job(uuid, boolean, boolean, text, text, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_automation_cron() TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_automation_config(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_automation_cron() TO service_role;
