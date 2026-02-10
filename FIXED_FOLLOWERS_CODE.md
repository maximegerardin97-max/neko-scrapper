# Fixed Code - Getting Followers (Not Following)

The actor name suggests it might be scraping "following" instead of "followers". Let's try adding a parameter to specify we want followers, or find the correct field.

```typescript
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";
const APIFY_ACTOR_ID = Deno.env.get("APIFY_ACTOR_ID") ?? "kaitoeasyapi/premium-x-follower-scraper-following-data";

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
  const encodedActorId = encodeURIComponent(APIFY_ACTOR_ID);
  const startRunUrl = `https://api.apify.com/v2/acts/${encodedActorId}/runs`;
  
  // Try different input formats - the actor might need a "type" parameter
  const inputPayloads = [
    {
      userNameList: [handle],
      maxFollowings: 10000,
      scrapeType: "followers", // Try specifying followers
    },
    {
      userNameList: [handle],
      maxFollowings: 10000,
      type: "followers",
    },
    {
      userNameList: [handle],
      maxFollowings: 10000,
      mode: "followers",
    },
    {
      userNameList: [handle],
      maxFollowings: 10000,
      // No type parameter - default
    },
  ];

  let startRunResponse;
  let lastError;
  let successfulPayload;
  
  for (const inputPayload of inputPayloads) {
    startRunResponse = await fetch(startRunUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${APIFY_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inputPayload),
    });

    if (startRunResponse.ok) {
      successfulPayload = inputPayload;
      break;
    } else {
      const errorText = await startRunResponse.text();
      lastError = errorText;
    }
  }

  if (!startRunResponse || !startRunResponse.ok) {
    return json(
      {
        error: "Failed to start Apify actor.",
        detail: lastError || "Unknown error",
        actorId: APIFY_ACTOR_ID,
      },
      startRunResponse?.status || 500,
    );
  }

  const runData = await startRunResponse.json();
  const runId = runData.data.id;

  // Step 2: Poll for completion
  const maxWaitTime = 600000;
  const pollInterval = 5000;
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
      return json({ 
        error: `Run ${runStatus.toLowerCase()}.`,
        detail: statusData.data.statusMessage || "Check Apify dashboard for details."
      }, 500);
    }
  }

  if (runStatus !== "SUCCEEDED") {
    return json({ 
      error: "Run timed out or failed.",
      runId: runId,
    }, 500);
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

  if (!items || items.length === 0) {
    return json({ error: "No followers found." }, 404);
  }

  // Step 4: Filter out mock data and format as CSV
  // Filter out items that look like mock data (check for the message text)
  const realFollowers = items.filter((item: any) => {
    const description = String(item.description || item.bio || item.about || "");
    // Filter out mock data - check if it contains the mock message
    return !description.includes("KaitoEasyAPI") && 
           !description.includes("reminder") &&
           !description.includes("mock data");
  });

  if (realFollowers.length === 0) {
    return json({ 
      error: "Only mock data returned. The actor may not be working correctly or the account has no followers.",
      detail: "Try a different account or a different Apify actor."
    }, 404);
  }

  const followers = realFollowers.map((item: any) => ({
    username: item.username || item.userName || item.handle || item.screenName || "",
    name: item.name || item.fullName || item.displayName || item.full_name || "",
    description: item.description || item.bio || item.about || item.biography || "",
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
