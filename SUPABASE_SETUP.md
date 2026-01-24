# Supabase Setup Instructions

## Step 1: Deploy the Edge Function

1. Make sure you have the Supabase CLI installed:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Deploy the function:
   ```bash
   supabase functions deploy x-scrapper
   ```

## Step 2: Set Environment Variables

In your Supabase Dashboard:

1. Go to **Project Settings** → **Edge Functions** → **x-scrapper**
2. Add the following environment variable:

### Required:
- **Name:** `TWITTER_BEARER_TOKEN`
- **Value:** Your Twitter/X API Bearer Token (get it from https://developer.twitter.com/)

### Optional:
- **Name:** `MAX_PAGES`
- **Value:** `10` (default, fetches up to 10,000 followers. Increase if needed)

## Step 3: Update Frontend URL

After deploying, update `app.js` with your actual Supabase function URL:
```javascript
const FUNCTION_URL = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/x-scrapper";
```

Replace `YOUR_PROJECT_REF` with your actual Supabase project reference (found in your project settings).
