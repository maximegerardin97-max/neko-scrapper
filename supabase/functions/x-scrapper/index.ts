import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const TWITTER_BEARER_TOKEN = Deno.env.get("TWITTER_BEARER_TOKEN") ?? "";
const MAX_PAGES = Number(Deno.env.get("MAX_PAGES") ?? "10");

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
  const stringValue = value ?? "";
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

const twitterFetch = async (url: string) => {
  return await fetch(url, {
    headers: {
      Authorization: `Bearer ${TWITTER_BEARER_TOKEN}`,
    },
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!TWITTER_BEARER_TOKEN) {
    return json(
      { error: "Missing TWITTER_BEARER_TOKEN environment variable." },
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

  const userLookupUrl =
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=name,description`;
  const userLookupResponse = await twitterFetch(userLookupUrl);

  if (!userLookupResponse.ok) {
    const errorText = await userLookupResponse.text();
    return json(
      {
        error: "Failed to fetch user.",
        detail: errorText,
      },
      userLookupResponse.status,
    );
  }

  const userLookup = await userLookupResponse.json();
  const userId = userLookup?.data?.id;
  if (!userId) {
    return json({ error: "User not found." }, 404);
  }

  const followers: Array<{
    username: string;
    name: string;
    description?: string;
  }> = [];

  let nextToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      max_results: "1000",
      "user.fields": "name,description,username",
    });

    if (nextToken) {
      params.set("pagination_token", nextToken);
    }

    const followersUrl =
      `https://api.twitter.com/2/users/${userId}/followers?${params.toString()}`;
    const followersResponse = await twitterFetch(followersUrl);

    if (!followersResponse.ok) {
      const errorText = await followersResponse.text();
      return json(
        {
          error: "Failed to fetch followers.",
          detail: errorText,
        },
        followersResponse.status,
      );
    }

    const payload = await followersResponse.json();
    const data = payload?.data ?? [];
    followers.push(
      ...data.map((item: { username: string; name: string; description?: string }) => ({
        username: item.username,
        name: item.name,
        description: item.description ?? "",
      })),
    );

    nextToken = payload?.meta?.next_token;
    if (!nextToken) {
      break;
    }
  }

  const header = "username,name,bio";
  const rows = followers.map((follower) =>
    [
      csvEscape(follower.username),
      csvEscape(follower.name),
      csvEscape(follower.description ?? ""),
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  return csvResponse(csv, `followers_${handle}.csv`);
});
