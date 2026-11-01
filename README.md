# LinkedIn AutoPost (market-pulse-poster)

App to generate and publish LinkedIn posts from commodity / news sources (Firecrawl + AI BYOK + LinkedIn API).

## Stack

- Vite + React + TypeScript + Tailwind / shadcn
- Supabase (Auth, Postgres, Edge Functions, Storage, pg_cron)

## Setup

1. Copy `.env` with your project values:

```env
VITE_SUPABASE_PROJECT_ID=your_project_ref
VITE_SUPABASE_URL=https://your_project_ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_or_publishable_key
```

2. Install and run:

```sh
npm i
npm run dev
```

3. In Supabase Dashboard → Authentication, enable Email and (optionally) Google OAuth with your redirect URL.

4. In the app Settings, enable BYOK and add at least one provider key (OpenAI, Gemini, and/or xAI). Add Firecrawl for scraping.

5. Edge Function secrets (Dashboard → Edge Functions → Secrets): `CRON_SECRET`, optional `FIRECRAWL_API_KEY` / `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` / `GEMINI_API_KEY` as fallbacks.
