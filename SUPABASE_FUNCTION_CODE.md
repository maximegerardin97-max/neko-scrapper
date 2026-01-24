# Supabase Edge Function Code Reference

## File Structure

The function code is already in your repo at:
- `supabase/functions/x-scrapper/index.ts` (main function)
- `supabase/functions/_shared/cors.ts` (CORS headers)

## What's Already Deployed

When you run `supabase functions deploy x-scrapper`, it will automatically use the code from:
- `supabase/functions/x-scrapper/index.ts`
- `supabase/functions/_shared/cors.ts`

## Environment Variables to Set in Supabase Dashboard

After deploying, go to **Edge Functions** → **x-scrapper** → **Settings** → **Environment Variables**:

### Required:
```
TWITTER_BEARER_TOKEN = [Your Twitter API Bearer Token]
```

### Optional:
```
MAX_PAGES = 10
```

## Quick Deploy Command

```bash
supabase functions deploy x-scrapper
```

That's it! The code is already in your repo and will be deployed automatically.
