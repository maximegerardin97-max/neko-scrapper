# TikTok Comments Scraper - Supabase Function Code

Use a DIFFERENT environment variable name so it doesn't conflict with the X scraper!

```typescript
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";
const TIKTOK_APIFY_ACTOR_ID = Deno.env.get("TIKTOK_APIFY_ACTOR_ID") ?? "clockworks/tiktok-comments-scraper";

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

const normalizeVideoUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("tiktok.com") || url.hostname.includes("vm.tiktok.com")) {
      return trimmed;
    }
  } catch (_error) {
    // Not a URL.
  }
  return trimmed;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

  let body: { handle?: string; runId?: string };
  try {
    body = await req.json();
  } catch (_error) {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const videoUrl = normalizeVideoUrl(body.handle ?? "");
  const runIdFromClient = body.runId?.trim();

  // 1) START RUN (no runId)
  if (!runIdFromClient) {
    if (!videoUrl) {
      return json({ error: "Missing or invalid TikTok video URL." }, 400);
    }

    const encodedActorId = encodeURIComponent(TIKTOK_APIFY_ACTOR_ID);
    const startRunUrl = `https://api.apify.com/v2/acts/${encodedActorId}/runs`;

    // TikTok comments scraper typically needs video URLs
    const inputPayload = {
      startUrls: [{ url: videoUrl }],
      // Common parameters - adjust based on actor docs
      maxComments: 10000, // Adjust as needed
    };

    const startRunResponse = await fetch(startRunUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${APIFY_API_TOKEN}`,
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
    const runId = runData?.data?.id;
    if (!runId) {
      return json(
        { error: "Apify run started but no runId returned." },
        500,
      );
    }

    return json(
      {
        status: "started",
        runId,
        handle: videoUrl,
      },
      200,
    );
  }

  // 2) POLL RUN STATUS (with runId)
  const runStatusUrl = `https://api.apify.com/v2/actor-runs/${runIdFromClient}`;
  const statusResponse = await fetch(runStatusUrl, {
    headers: {
      Authorization: `Bearer ${APIFY_API_TOKEN}`,
    },
  });

  if (!statusResponse.ok) {
    const errorText = await statusResponse.text();
    return json(
      {
        error: "Failed to check Apify run status.",
        detail: errorText,
      },
      statusResponse.status,
    );
  }

  const statusData = await statusResponse.json();
  const runStatus = statusData?.data?.status;
  const datasetId = statusData?.data?.defaultDatasetId;

  if (runStatus === "RUNNING" || runStatus === "READY" || runStatus === "PENDING") {
    return json(
      {
        status: "running",
        runId: runIdFromClient,
      },
      200,
    );
  }

  if (runStatus === "FAILED" || runStatus === "ABORTED" || !datasetId) {
    return json(
      {
        status: "error",
        runId: runIdFromClient,
        error: `Run ${runStatus?.toLowerCase() || "unknown"}.`,
      },
      500,
    );
  }

  // 3) RUN FINISHED → FETCH DATASET
  const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items`;
  const datasetResponse = await fetch(datasetUrl, {
    headers: {
      Authorization: `Bearer ${APIFY_API_TOKEN}`,
    },
  });

  if (!datasetResponse.ok) {
    return json({ error: "Failed to fetch dataset from Apify." }, 500);
  }

  const items = await datasetResponse.json();

  if (!items || items.length === 0) {
    return json(
      {
        error: "No comments found in dataset.",
        runId: runIdFromClient,
        status: runStatus,
      },
      404,
    );
  }

  // 4) Format as CSV - adjust field mapping based on actual TikTok actor output
  // Common fields: text, author, likes, replies, timestamp, etc.
  const comments = items.map((item: any) => {
    const username = item.authorUsername || item.author?.username || item.username || "";
    return {
      username,
      comment: item.text || item.comment || item.content || "",
      likes: item.diggCount || item.likes || item.likeCount || "",
      replies: item.replyCount || item.replies || "",
      timestamp: item.createTime || item.timestamp || item.createdAt || "",
      profileUrl: username ? `https://www.tiktok.com/@${username}` : "",
    };
  });

  const header = "username,comment,likes,replies,timestamp,profile_url";
  const rows = comments.map((comment) =>
    [
      csvEscape(comment.username),
      csvEscape(comment.comment),
      csvEscape(String(comment.likes)),
      csvEscape(String(comment.replies)),
      csvEscape(String(comment.timestamp)),
      csvEscape(comment.profileUrl),
    ].join(","),
  );
  const csv = [header, ...rows].join("\n");
  return csvResponse(csv, `tiktok_comments_${videoUrl.replace(/[^a-zA-Z0-9]/g, "_")}.csv`);
});
```

## Environment Variables to Set:

For the `tiktok-comments-scraper` function, set:
- `APIFY_API_TOKEN` = your Apify token (same as X scraper)
- `TIKTOK_APIFY_ACTOR_ID` = `clockworks/tiktok-comments-scraper` (optional, defaults to this)

This way it won't conflict with your X scraper's `APIFY_ACTOR_ID`!
