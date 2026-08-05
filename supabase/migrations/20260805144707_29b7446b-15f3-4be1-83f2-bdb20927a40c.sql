CREATE TABLE public.linkedin_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'person',
  urn text NOT NULL,
  name text NOT NULL,
  avatar_url text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'connected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, urn)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_targets TO authenticated;
GRANT ALL ON public.linkedin_targets TO service_role;

ALTER TABLE public.linkedin_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Targets select own" ON public.linkedin_targets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Targets insert own" ON public.linkedin_targets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Targets update own" ON public.linkedin_targets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Targets delete own" ON public.linkedin_targets FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_linkedin_targets_updated_at
BEFORE UPDATE ON public.linkedin_targets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_linkedin_targets_user ON public.linkedin_targets(user_id);

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS target_id uuid REFERENCES public.linkedin_targets(id) ON DELETE SET NULL;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS target_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE public.topic_queue ADD COLUMN IF NOT EXISTS target_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE public.schedule_runs ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE public.schedule_runs ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1;
ALTER TABLE public.schedule_runs ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'schedule';

INSERT INTO public.linkedin_targets (user_id, kind, urn, name, access_token, token_expires_at, scopes, is_default, status)
SELECT s.user_id,
       'person',
       CASE WHEN s.linkedin_person_urn LIKE 'urn:li:%' THEN s.linkedin_person_urn ELSE 'urn:li:person:' || s.linkedin_person_urn END,
       'Profil LinkedIn',
       s.linkedin_access_token,
       s.linkedin_token_expires_at,
       'openid profile w_member_social email',
       true,
       CASE WHEN s.linkedin_token_expires_at IS NOT NULL AND s.linkedin_token_expires_at <= now() THEN 'expired' ELSE 'connected' END
FROM public.user_settings s
WHERE s.linkedin_person_urn IS NOT NULL AND s.linkedin_access_token IS NOT NULL
ON CONFLICT (user_id, urn) DO NOTHING;