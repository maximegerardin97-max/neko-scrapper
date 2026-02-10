# Correct Code - Using getFollowers Parameter

Based on the actor description, you need to set `getFollowers: true` and `maxFollowers` to actually get followers!

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
  // According to the docs, we need:
  // - getFollowers: true (to get followers)
  // - getFollowing: false (we don't need following)
  // - maxFollowers: 20-100000 (minimum 20)
  // - username: the handle
  const encodedActorId = encodeURIComponent(APIFY_ACTOR_ID);
  const startRunUrl = `https://api.apify.com/v2/acts/${encodedActorId}/runs`;
  
  const inputPayload = {
    getFollowers: true,        // THIS IS THE KEY - we need this!
    getFollowing: false,       // We don't need following
    maxFollowers: 10000,       // Get up to 10k followers (min 20, max 100000)
    maxFollowings: 200,        // Still need this (minimum required)
    username: handle,           // Use username field
  };

  const startRunResponse = await fetch(startRunUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${APIFY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(inputPayload),
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

  // Step 2: Poll for completion
  const maxWaitTime = 600000; // 10 minutes
  const pollInterval = 5000; // 5 seconds
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
  // Based on the sample output, the fields are: screen_name, name, description
  const realFollowers = items.filter((item: any) => {
    // Filter out mock data
    const description = String(item.description || "");
    const name = String(item.name || "");
    return !description.includes("KaitoEasyAPI") && 
           !description.includes("reminder") &&
           !description.includes("mock data") &&
           !name.includes("KaitoEasyAPI") &&
           item.type === "follower"; // Only get followers, not following
  });

  if (realFollowers.length === 0) {
    return json({ 
      error: "No real followers found. Only mock data returned.",
      suggestion: "The account might have no public followers or the actor couldn't access them."
    }, 404);
  }

  // Step 5: Format as CSV
  // Based on sample output: screen_name, name, description
  const followers = realFollowers.map((item: any) => ({
    username: item.screen_name || item.username || item.userName || "",
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
