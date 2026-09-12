-- Least privilege: remove privileges the app never needs from authenticated
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.content_sources FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.linkedin_targets FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.posts FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.profiles FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.schedule_runs FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.schedules FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.topic_queue FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.user_settings FROM authenticated;

-- schedule_runs is read-only from the client
REVOKE INSERT, UPDATE, DELETE ON public.schedule_runs FROM authenticated;

-- Ensure anon has no access to any user data table
REVOKE ALL ON public.content_sources FROM anon;
REVOKE ALL ON public.linkedin_targets FROM anon;
REVOKE ALL ON public.posts FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.schedule_runs FROM anon;
REVOKE ALL ON public.schedules FROM anon;
REVOKE ALL ON public.topic_queue FROM anon;
REVOKE ALL ON public.user_settings FROM anon;
REVOKE ALL ON public.app_settings FROM anon;
REVOKE ALL ON public.app_settings FROM authenticated;