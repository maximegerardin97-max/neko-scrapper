# Supabase Code for Hjalmar Hypemeter

## 1. SQL - Create Table (run once in SQL Editor)

```sql
create extension if not exists "pgcrypto";

create table if not exists hjalmar_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  total_followers integer not null,
  tech_vc integer not null,
  medical integer not null,
  other integer not null
);
```

## 2. Edge Function: `hjalmar-hypemeter` (paste into index.ts)

```typescript
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";
const APIFY_ACTOR_ID =
  Deno.env.get("APIFY_ACTOR_ID") ??
  "kaitoeasyapi/premium-x-follower-scraper-following-data";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const HYPE_HANDLE = "HNilsonne";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const classifyFollower = (name: string, bio: string) => {
  const text = `${name} ${bio}`.toLowerCase();

  const techStrong = [
    "vc", "venture", "general partner", "gp ", " gp,", "investor", "angel",
    "fund", "capital", "lp", "yc ", "y combinator", "startup", "founder",
    "cofounder", "operator", "pre-seed", "pre seed", "seed fund", "series a",
    "growth", "product manager", " pm ", "cto", "ceo", "cso", "cpo",
    "ai", "ml", "saas", "software", "engineer", "developer", "builder",
    "tech ", "b2b", "b2c",
  ];

  const techWeak = [
    "portfolio", "accelerator", "incubator", "scaleup", "innovation",
    "ecosystem", "operator investor",
  ];

  const medicalStrong = [
    "doctor", " dr ", " dr.", "md", "physician", "surgeon",
    "radiology", "radiologist", "oncology", "oncologist", "cardiology",
    "neurology", "psych ", "clinic", "hospital", "er ", "emergency room",
    "gp (general practitioner)", "nurse", " rn ", "healthcare", "medtech",
    "patient care",
  ];

  const medicalWeak = [
    "health", "wellness", "public health", "epidemiology", "clinical",
    "therapist", "counselor", "mental health",
  ];

  let techScore = 0;
  let medicalScore = 0;

  techStrong.forEach((k) => { if (text.includes(k)) techScore += 3; });
  techWeak.forEach((k) => { if (text.includes(k)) techScore += 1; });

  medicalStrong.forEach((k) => { if (text.includes(k)) medicalScore += 3; });
  medicalWeak.forEach((k) => { if (text.includes(k)) medicalScore += 1; });

  if (techScore === 0 && medicalScore === 0) return "Other";
  if (techScore >= medicalScore) return "Tech / VC";
  return "Medical";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!APIFY_API_TOKEN) {
    return json({ error: "Missing APIFY_API_TOKEN env." }, 500);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }, 500);
  }

  let body: { runId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // 1) If we already have a runId, poll Apify and, if done, compute + persist KPIs
  if (body.runId) {
    const statusUrl = `https://api.apify.com/v2/actor-runs/${body.runId}`;
    const statusResp = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
    });

    if (!statusResp.ok) {
      const detail = await statusResp.text();
      return json({ error: "Failed to check run status.", detail }, 500);
    }

    const statusData = await statusResp.json();
    const runStatus = statusData.data.status;

    if (runStatus === "RUNNING") {
      return json({ status: "running" });
    }

    if (runStatus === "FAILED" || runStatus === "ABORTED") {
      return json(
        {
          error: `Run ${runStatus.toLowerCase()}.`,
          detail: statusData.data.statusMessage || "Check Apify dashboard.",
        },
        500,
      );
    }

    if (runStatus === "SUCCEEDED") {
      const datasetId = statusData.data.defaultDatasetId;
      if (!datasetId) {
        return json({ error: "No dataset ID in completed run." }, 500);
      }

      const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items`;
      const datasetResp = await fetch(datasetUrl, {
        headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
      });

      if (!datasetResp.ok) {
        const detail = await datasetResp.text();
        return json({ error: "Failed to fetch dataset.", detail }, 500);
      }

      const items = await datasetResp.json();
      if (!Array.isArray(items) || items.length === 0) {
        return json({ error: "No items in dataset." }, 404);
      }

      // Followers + KPIs
      let total = 0;
      let tech = 0;
      let medical = 0;
      let other = 0;

      const followers = items
        .filter((item: any) => item.type === "follower")
        .map((item: any) => {
          const username = item.screen_name || item.username || "";
          const name = item.name || "";
          const bio = item.description || "";
          const location = item.location || "";
          const profileUrl = username ? `https://twitter.com/${username}` : "";

          const category = classifyFollower(name, bio);
          total += 1;
          if (category === "Tech / VC") tech += 1;
          else if (category === "Medical") medical += 1;
          else other += 1;

          return {
            username,
            name,
            bio,
            location,
            profileUrl,
            category,
          };
        });

      if (followers.length === 0) {
        return json({ error: "No follower rows after filtering." }, 404);
      }

      // Insert snapshot
      const { error: insertError } = await supabase
        .from("hjalmar_snapshots")
        .insert({
          total_followers: total,
          tech_vc: tech,
          medical,
          other,
        });

      if (insertError) {
        return json({ error: "Failed to insert snapshot.", detail: insertError.message }, 500);
      }

      // Fetch all snapshots for timeline + deltas
      const { data: snaps, error: snapsError } = await supabase
        .from("hjalmar_snapshots")
        .select("*")
        .order("created_at", { ascending: true });

      if (snapsError || !snaps || snaps.length === 0) {
        return json({
          kpis: { total, tech_vc: tech, medical, other },
          weeklyDelta: null,
          monthlyDelta: null,
          timeline: [],
          followers,
        });
      }

      const latest = snaps[snaps.length - 1];
      const latestTime = new Date(latest.created_at).getTime();
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const monthMs = 30 * 24 * 60 * 60 * 1000;

      let weekRef: any = null;
      let monthRef: any = null;

      for (const s of snaps) {
        const t = new Date(s.created_at).getTime();
        if (latestTime - t >= weekMs && (!weekRef || t > new Date(weekRef.created_at).getTime())) {
          weekRef = s;
        }
        if (latestTime - t >= monthMs && (!monthRef || t > new Date(monthRef.created_at).getTime())) {
          monthRef = s;
        }
      }

      const kpis = {
        total,
        tech_vc: tech,
        medical,
        other,
      };

      const weeklyDelta = weekRef
        ? {
            total: total - weekRef.total_followers,
            tech_vc: tech - weekRef.tech_vc,
            medical: medical - weekRef.medical,
            other: other - weekRef.other,
          }
        : null;

      const monthlyDelta = monthRef
        ? {
            total: total - monthRef.total_followers,
            tech_vc: tech - monthRef.tech_vc,
            medical: medical - monthRef.medical,
            other: other - monthRef.other,
          }
        : null;

      const timeline = snaps.map((s) => ({
        date: s.created_at,
        total: s.total_followers,
        tech_vc: s.tech_vc,
        medical: s.medical,
        other: s.other,
      }));

      return json({
        status: "done",
        kpis,
        weeklyDelta,
        monthlyDelta,
        timeline,
        followers,
      });
    }

    // Any other status
    return json({ error: `Unexpected run status: ${runStatus}` }, 500);
  }

  // 2) No runId -> start a new Apify run for HNilsonne
  const encodedActorId = encodeURIComponent(APIFY_ACTOR_ID);
  const startRunUrl = `https://api.apify.com/v2/acts/${encodedActorId}/runs`;

  const inputPayload = {
    getFollowers: true,
    getFollowing: false,
    maxFollowers: 32000,
    maxFollowings: 200,
    username: HYPE_HANDLE,
  };

  const startResp = await fetch(startRunUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${APIFY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(inputPayload),
  });

  if (!startResp.ok) {
    const detail = await startResp.text();
    return json(
      { error: "Failed to start Apify actor.", detail },
      startResp.status,
    );
  }

  const runData = await startResp.json();
  const runId = runData?.data?.id;
  if (!runId) {
    return json({ error: "Apify run started but no runId returned." }, 500);
  }

  return json({ status: "running", runId });
});
```

## 3. Environment Variables for `hjalmar-hypemeter` function

- `APIFY_API_TOKEN` = your Apify token (same as x-scrapper)
- `APIFY_ACTOR_ID` = `kaitoeasyapi/premium-x-follower-scraper-following-data` (same as x-scrapper)
- `SUPABASE_URL` = your project URL (e.g. `https://cqlopsqqqzzkfpmcntbv.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` = your service role key (from Supabase project settings)
