REVOKE ALL ON public.app_settings FROM authenticated, anon;
GRANT ALL ON public.app_settings TO service_role;