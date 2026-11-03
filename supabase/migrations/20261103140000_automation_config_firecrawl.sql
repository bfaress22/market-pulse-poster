-- Project-level Firecrawl key fallback for edge functions (when user BYOK / env secret missing).
ALTER TABLE public.automation_config
  ADD COLUMN IF NOT EXISTS firecrawl_api_key text;
