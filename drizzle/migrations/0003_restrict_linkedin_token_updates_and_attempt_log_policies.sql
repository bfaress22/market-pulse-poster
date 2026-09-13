-- 1. Prevent clients from overwriting token-adjacent columns on linkedin_targets.
-- Replace the table-level UPDATE grant with a column-level grant limited to
-- non-sensitive display fields the app actually edits (is_default, name, avatar_url, status).
REVOKE UPDATE ON public.linkedin_targets FROM authenticated;
GRANT UPDATE (name, avatar_url, is_default, status) ON public.linkedin_targets TO authenticated;

-- 2. Explicit deny policies for UPDATE/DELETE on publication_attempts (audit log).
CREATE POLICY "publication_attempts_no_client_update"
ON public.publication_attempts
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "publication_attempts_no_client_delete"
ON public.publication_attempts
FOR DELETE
TO anon, authenticated
USING (false);