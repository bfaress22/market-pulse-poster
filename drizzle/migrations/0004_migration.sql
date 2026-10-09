ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS has_linkedin_client_secret boolean GENERATED ALWAYS AS (linkedin_client_secret IS NOT NULL AND linkedin_client_secret <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_openai_api_key boolean GENERATED ALWAYS AS (openai_api_key IS NOT NULL AND openai_api_key <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_gemini_api_key boolean GENERATED ALWAYS AS (gemini_api_key IS NOT NULL AND gemini_api_key <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_anthropic_api_key boolean GENERATED ALWAYS AS (anthropic_api_key IS NOT NULL AND anthropic_api_key <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_mistral_api_key boolean GENERATED ALWAYS AS (mistral_api_key IS NOT NULL AND mistral_api_key <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_groq_api_key boolean GENERATED ALWAYS AS (groq_api_key IS NOT NULL AND groq_api_key <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_deepseek_api_key boolean GENERATED ALWAYS AS (deepseek_api_key IS NOT NULL AND deepseek_api_key <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_xai_api_key boolean GENERATED ALWAYS AS (xai_api_key IS NOT NULL AND xai_api_key <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_perplexity_api_key boolean GENERATED ALWAYS AS (perplexity_api_key IS NOT NULL AND perplexity_api_key <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_openrouter_api_key boolean GENERATED ALWAYS AS (openrouter_api_key IS NOT NULL AND openrouter_api_key <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_firecrawl_api_key boolean GENERATED ALWAYS AS (firecrawl_api_key IS NOT NULL AND firecrawl_api_key <> '') STORED;

GRANT SELECT (
  has_linkedin_client_secret, has_openai_api_key, has_gemini_api_key, has_anthropic_api_key,
  has_mistral_api_key, has_groq_api_key, has_deepseek_api_key, has_xai_api_key,
  has_perplexity_api_key, has_openrouter_api_key, has_firecrawl_api_key
) ON public.user_settings TO authenticated;