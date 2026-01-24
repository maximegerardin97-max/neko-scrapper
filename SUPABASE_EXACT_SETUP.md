# Exact Supabase Setup - Copy & Paste Guide

## 🚀 Quick Setup Steps

### 1. Deploy the Edge Function

Run these commands in your terminal:

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link your project (replace YOUR_PROJECT_REF with your actual project ref)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy x-scrapper
```

### 2. Set Environment Variables in Supabase Dashboard

Go to: **Supabase Dashboard** → **Your Project** → **Edge Functions** → **x-scrapper** → **Settings** → **Environment Variables**

Add these variables:

#### Required Variable:
```
Name: TWITTER_BEARER_TOKEN
Value: [Your Twitter/X API Bearer Token]
```

To get your Bearer Token:
1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new app or use an existing one
3. Go to "Keys and tokens" tab
4. Copy your "Bearer Token"

#### Optional Variable (if you want to fetch more followers):
```
Name: MAX_PAGES
Value: 10
```
- Default is 10 (fetches up to 10,000 followers)
- Each page = 1,000 followers
- Increase if you need more (e.g., 20 = 20,000 followers)

### 3. Enable GitHub Pages

1. Go to your GitHub repo: https://github.com/maximegerardin97-max/neko-scrapper
2. Go to **Settings** → **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Select **main** branch and **/ (root)** folder
5. Click **Save**
6. Your site will be available at: `https://maximegerardin97-max.github.io/neko-scrapper/`

### 4. Update Frontend with Your Supabase URL

After deploying the function, update `app.js`:

1. Find your Supabase project reference in your Supabase dashboard (it's in the URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`)
2. Edit `app.js` and replace this line:
   ```javascript
   const FUNCTION_URL = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/x-scrapper";
   ```
   With your actual URL:
   ```javascript
   const FUNCTION_URL = "https://abcdefghijklmnop.supabase.co/functions/v1/x-scrapper";
   ```
3. Commit and push the change:
   ```bash
   git add app.js
   git commit -m "Update Supabase function URL"
   git push
   ```

## ✅ That's it! Your tool is ready to use.

Visit your GitHub Pages URL and start extracting followers!
