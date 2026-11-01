# Architecture rules
- Resolve text provider routing in `supabase/functions/_shared/ai-text.ts` for all manual and automated generation paths so model selection uses the same per-user credentials everywhere.
- Discover Grok language and image models server-side using the authenticated user's saved xAI key; return model metadata only, never credentials, so both pickers reflect account availability without exposing secrets.
- Route selected xAI images through `_shared/xai-image.ts` in manual and automated generation, keeping non-xAI routes unchanged so provider keys and billing stay isolated.