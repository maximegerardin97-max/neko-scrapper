# Neko Scrapper

Minimal front-end hosted on GitHub Pages + Supabase Edge Function backend.

## Frontend (GitHub Pages)
1. Update `FUNCTION_URL` in `app.js` to your Supabase Function URL:
   `https://<project-ref>.supabase.co/functions/v1/x-scrapper`
2. Deploy `index.html`, `styles.css`, and `app.js` to GitHub Pages.

## Backend (Supabase Edge Function)
1. Set the environment variable in Supabase:
   - `TWITTER_BEARER_TOKEN` (X/Twitter API v2 bearer token)
   - Optional: `MAX_PAGES` (default 10; each page up to 1000 followers)
2. Deploy the function:
   ```bash
   supabase functions deploy x-scrapper
   ```

## Notes
- X/Twitter follower endpoints require a paid API plan.
- Large accounts can exceed Edge Function time limits; increase `MAX_PAGES` or
  run multiple calls with pagination support if needed.
