-- 1) schedule_runs: writes are service-role only. Remove client write privileges entirely.
REVOKE INSERT, UPDATE, DELETE ON public.schedule_runs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.schedule_runs FROM anon;
REVOKE ALL ON public.schedule_runs FROM anon;
GRANT SELECT ON public.schedule_runs TO authenticated;
GRANT ALL ON public.schedule_runs TO service_role;

-- Explicit deny policies so no client role can write, even if grants change later
DROP POLICY IF EXISTS "Schedule runs no client insert" ON public.schedule_runs;
CREATE POLICY "Schedule runs no client insert"
  ON public.schedule_runs FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "Schedule runs no client update" ON public.schedule_runs;
CREATE POLICY "Schedule runs no client update"
  ON public.schedule_runs FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Schedule runs no client delete" ON public.schedule_runs;
CREATE POLICY "Schedule runs no client delete"
  ON public.schedule_runs FOR DELETE TO authenticated, anon
  USING (false);

-- 2) Hide GraphQL schema from signed-in users
REVOKE USAGE ON SCHEMA graphql FROM authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA graphql FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM authenticated;
REVOKE USAGE ON SCHEMA graphql_public FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM authenticated;