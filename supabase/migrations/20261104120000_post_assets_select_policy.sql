-- Client uploads need SELECT to createSignedUrl after INSERT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Post assets select own'
  ) THEN
    CREATE POLICY "Post assets select own" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'post-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Post assets select public'
  ) THEN
    CREATE POLICY "Post assets select public" ON storage.objects
      FOR SELECT
      USING (bucket_id = 'post-assets');
  END IF;
END $$;
