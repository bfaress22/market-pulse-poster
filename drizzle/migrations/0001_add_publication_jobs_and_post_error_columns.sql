-- posts error/attempt tracking columns
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- publication jobs
CREATE TABLE IF NOT EXISTS public.publication_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  target_id uuid REFERENCES public.linkedin_targets(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.topic_queue(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS publication_jobs_status_idx ON public.publication_jobs (status, last_attempt_at);
CREATE INDEX IF NOT EXISTS publication_jobs_user_idx ON public.publication_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS publication_jobs_post_idx ON public.publication_jobs (post_id);

GRANT SELECT ON public.publication_jobs TO authenticated;
GRANT ALL ON public.publication_jobs TO service_role;
ALTER TABLE public.publication_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS publication_jobs_select_own ON public.publication_jobs;
CREATE POLICY publication_jobs_select_own
  ON public.publication_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS publication_jobs_no_client_insert ON public.publication_jobs;
CREATE POLICY publication_jobs_no_client_insert
  ON public.publication_jobs FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS publication_jobs_no_client_update ON public.publication_jobs;
CREATE POLICY publication_jobs_no_client_update
  ON public.publication_jobs FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS publication_jobs_no_client_delete ON public.publication_jobs;
CREATE POLICY publication_jobs_no_client_delete
  ON public.publication_jobs FOR DELETE TO anon, authenticated USING (false);

-- publication attempts
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

CREATE INDEX IF NOT EXISTS publication_attempts_job_idx ON public.publication_attempts (publication_job_id, attempt_number);

GRANT SELECT ON public.publication_attempts TO authenticated;
GRANT ALL ON public.publication_attempts TO service_role;
ALTER TABLE public.publication_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS publication_attempts_select_own ON public.publication_attempts;
CREATE POLICY publication_attempts_select_own
  ON public.publication_attempts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.publication_jobs j
    WHERE j.id = publication_job_id AND j.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS publication_attempts_no_client_write ON public.publication_attempts;
CREATE POLICY publication_attempts_no_client_write
  ON public.publication_attempts FOR INSERT TO anon, authenticated WITH CHECK (false);