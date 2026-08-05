CREATE TABLE public.topic_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  language text NOT NULL DEFAULT 'fr',
  scheduled_at timestamptz NOT NULL,
  include_image boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'scheduled_topic',
  error text,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_queue TO authenticated;
GRANT ALL ON public.topic_queue TO service_role;

ALTER TABLE public.topic_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Topic queue select own" ON public.topic_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Topic queue insert own" ON public.topic_queue FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Topic queue update own" ON public.topic_queue FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Topic queue delete own" ON public.topic_queue FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_topic_queue_updated_at BEFORE UPDATE ON public.topic_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_topic_queue_due ON public.topic_queue (status, scheduled_at);

ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'fr';