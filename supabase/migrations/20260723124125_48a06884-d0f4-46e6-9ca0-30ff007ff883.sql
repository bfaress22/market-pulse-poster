
-- Remove permissive insert policy
DROP POLICY IF EXISTS "Service role can upload post assets" ON storage.objects;

-- Add SELECT policy scoped to owner folder
DROP POLICY IF EXISTS "Post assets read own" ON storage.objects;
CREATE POLICY "Post assets read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'post-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Allow service_role full access for edge functions
DROP POLICY IF EXISTS "Post assets service role all" ON storage.objects;
CREATE POLICY "Post assets service role all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'post-assets')
  WITH CHECK (bucket_id = 'post-assets');

-- Hide public tables from GraphQL for authenticated role
REVOKE USAGE ON SCHEMA graphql FROM authenticated;
