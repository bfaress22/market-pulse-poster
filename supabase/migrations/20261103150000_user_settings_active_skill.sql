-- Active content skill (e.g. commohedge-daily) for text + image generation
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS active_skill text;

COMMENT ON COLUMN public.user_settings.active_skill IS
  'Slug of runtime content skill (e.g. commohedge-daily). Null = no skill.';

-- Column-level grants must re-include the new field after REVOKE ALL patterns
REVOKE SELECT ON public.user_settings FROM authenticated, anon;
GRANT SELECT (
  user_id,
  linkedin_client_id,
  linkedin_organization_id,
  linkedin_person_urn,
  linkedin_token_expires_at,
  post_model,
  image_model,
  use_byok,
  tone_instructions,
  active_skill,
  created_at,
  updated_at,
  has_linkedin_client_secret,
  has_openai_api_key,
  has_gemini_api_key,
  has_anthropic_api_key,
  has_mistral_api_key,
  has_groq_api_key,
  has_deepseek_api_key,
  has_xai_api_key,
  has_perplexity_api_key,
  has_openrouter_api_key,
  has_firecrawl_api_key
) ON public.user_settings TO authenticated;

REVOKE UPDATE ON public.user_settings FROM authenticated;
GRANT UPDATE (
  linkedin_client_id,
  linkedin_client_secret,
  linkedin_organization_id,
  post_model,
  image_model,
  use_byok,
  tone_instructions,
  active_skill,
  openai_api_key,
  gemini_api_key,
  anthropic_api_key,
  mistral_api_key,
  groq_api_key,
  deepseek_api_key,
  xai_api_key,
  perplexity_api_key,
  openrouter_api_key,
  firecrawl_api_key,
  updated_at
) ON public.user_settings TO authenticated;
