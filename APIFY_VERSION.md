# Apify Version - Code to Paste in Supabase

## Copy this entire code into Supabase Edge Function:

```typescript
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";
const APIFY_ACTOR_ID = Deno.env.get("APIFY_ACTOR_ID") ?? "apify/twitter-scraper"; // Default actor, change if needed

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const csvResponse = (csv: string, filename: string) =>
  new Response(csv, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });

const csvEscape = (value: string) => {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
};

const normalizeHandle = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("twitter.com") || url.hostname.includes("x.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[0] ?? "";
    }
  } catch (_error) {
    // Not a URL.
  }
  return trimmed.replace(/^@/, "").split("/")[0];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!APIFY_API_TOKEN) {
    return json(
      { error: "Missing APIFY_API_TOKEN environment variable." },
      500,
    );
  }

  let body: { handle?: string };
  try {
    body = await req.json();
  } catch (_error) {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const handle = normalizeHandle(body.handle ?? "");
  if (!handle) {
    return json({ error: "Missing or invalid handle." }, 400);
  }

  // Step 1: Start Apify actor run
  const startRunUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs`;
  const startRunResponse = await fetch(startRunUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${APIFY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startUrls: [{ url: `https://twitter.com/${handle}` }],
      // Adjust these based on the actor's input schema
      // Some actors might need: usernames: [handle], or profiles: [handle]
    }),
  });

  if (!startRunResponse.ok) {
    const errorText = await startRunResponse.text();
    return json(
      {
        error: "Failed to start Apify actor.",
        detail: errorText,
      },
      startRunResponse.status,
    );
  }

  const runData = await startRunResponse.json();
  const runId = runData.data.id;

  // Step 2: Poll for completion (max 5 minutes)
  const maxWaitTime = 300000; // 5 minutes
  const pollInterval = 3000; // 3 seconds
  const startTime = Date.now();
  let runStatus = "RUNNING";

  while (runStatus === "RUNNING" && Date.now() - startTime < maxWaitTime) {
    await sleep(pollInterval);
    const statusUrl = `https://api.apify.com/v2/actor-runs/${runId}`;
    const statusResponse = await fetch(statusUrl, {
      headers: {
        "Authorization": `Bearer ${APIFY_API_TOKEN}`,
      },
    });

    if (!statusResponse.ok) {
      return json({ error: "Failed to check run status." }, 500);
    }

    const statusData = await statusResponse.json();
    runStatus = statusData.data.status;

    if (runStatus === "SUCCEEDED") {
      break;
    } else if (runStatus === "FAILED" || runStatus === "ABORTED") {
      return json({ error: `Run ${runStatus.toLowerCase()}.` }, 500);
    }
  }

  if (runStatus !== "SUCCEEDED") {
    return json({ error: "Run timed out or failed." }, 500);
  }

  // Step 3: Get dataset items
  const datasetId = runData.data.defaultDatasetId;
  const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items`;
  const datasetResponse = await fetch(datasetUrl, {
    headers: {
      "Authorization": `Bearer ${APIFY_API_TOKEN}`,
    },
  });

  if (!datasetResponse.ok) {
    return json({ error: "Failed to fetch dataset." }, 500);
  }

  const items = await datasetResponse.json();

  // Step 4: Format as CSV
  // Adjust field mapping based on the actor's output format
  // Common fields: username, name, description, bio, etc.
  const followers = items.map((item: any) => ({
    username: item.username || item.userName || item.handle || "",
    name: item.name || item.fullName || item.displayName || "",
    description: item.description || item.bio || item.about || "",
  }));

  const header = "username,name,bio";
  const rows = followers.map((follower) =>
    [
      csvEscape(follower.username),
      csvEscape(follower.name),
      csvEscape(follower.description),
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  return csvResponse(csv, `followers_${handle}.csv`);
});
```

## Environment Variables to Set:

1. **APIFY_API_TOKEN** - Your Apify API token (get it from https://console.apify.com/account/integrations)
2. **APIFY_ACTOR_ID** (optional) - The actor ID to use. Default is `apify/twitter-scraper`. You may need to:
   - Search Apify store for "Twitter followers scraper" 
   - Use the actor ID from the actor page (e.g., `username/actor-name`)

## How to Get Apify API Token:

1. Go to https://console.apify.com/
2. Sign up/login
3. Go to Settings → Integrations
4. Copy your API token

## Finding the Right Apify Actor:

1. Go to https://apify.com/store
2. Search for "Twitter followers" or "X followers"
3. Check the actor's input/output schema
4. Update the code above to match the actor's expected input format (startUrls, usernames, etc.)
5. Update the field mapping in Step 4 to match the actor's output format
