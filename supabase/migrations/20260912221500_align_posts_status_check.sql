-- Live project (vlkirfionnppaoprsnuh) still has the original CHECK from
-- 20260308112139: status IN ('draft','generating','ready','published','failed').
-- Composer "Programmer" inserts status = 'scheduled', which violates that CHECK.
--
-- 20260912190000 (jobs/cron) was NOT applied on the live project
-- (public.publication_jobs does not exist). This migration only aligns the
-- CHECK. It replaces the constraint in a single statement so posts.status
-- is never unconstrained.

ALTER TABLE public.posts
  DROP CONSTRAINT posts_status_check,
  ADD CONSTRAINT posts_status_check
  CHECK (status IN (
    'draft',
    'generating',
    'ready',
    'scheduled',
    'queued',
    'processing',
    'retrying',
    'published',
    'failed'
  ));

COMMENT ON CONSTRAINT posts_status_check ON public.posts IS
  'Allowed post lifecycle: draft, generating, ready, scheduled, queued, processing, retrying, published, failed';
