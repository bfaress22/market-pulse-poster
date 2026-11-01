# Architecture rules
- Resolve text provider routing in `supabase/functions/_shared/ai-text.ts` for all manual and automated generation paths so model selection uses the same per-user BYOK credentials everywhere (OpenAI, Gemini, xAI).
- Discover Grok language and image models server-side using the authenticated user's saved xAI key; return model metadata only, never credentials, so both pickers reflect account availability without exposing secrets.
- Route selected xAI images through `_shared/xai-image.ts` and Gemini images through `_shared/ai-image.ts` in manual and automated generation; keep provider keys and billing isolated. Do not use any third-party AI gateway.
