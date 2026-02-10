const X_FUNCTION_URL =
  "https://cqlopsqqqzzkfpmcntbv.supabase.co/functions/v1/x-scrapper";
const TIKTOK_FUNCTION_URL =
  "https://cqlopsqqqzzkfpmcntbv.supabase.co/functions/v1/tiktok-comments-scraper";
const HYPEMETER_FUNCTION_URL =
  "https://cqlopsqqqzzkfpmcntbv.supabase.co/functions/v1/hjalmar-hypemeter";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxbG9wc3FxcXp6a2ZwbWNudGJ2Iiwicm9zZSI6ImFub24iLCJpYXQiOjE3NjMxMjUxNDMsImV4cCI6MjA3ODcwMTE0M30.J3vuzmF7cG3e6ZMx_NwHtmTIqQKJvKP1cGOXcoXBaX0";
const HYPE_HANDLE = "HNilsonne";

let currentMode = "x";

const form = document.getElementById("scrape-form");
const input = document.getElementById("handle-input");
const statusEl = document.getElementById("status");
const button = document.getElementById("extract-btn");
const subtitle = document.getElementById("subtitle");
const toggleX = document.getElementById("mode-toggle");
const toggleTiktok = document.getElementById("mode-toggle-tiktok");
const toggleHypemeter = document.getElementById("mode-toggle-hypemeter");
const hypPanel = document.getElementById("hypemeter-panel");
const hypDownloadBtn = document.getElementById("hypemeter-download-btn");
const hypTbody = document.getElementById("hypemeter-tbody");
const kpiTotal = document.getElementById("kpi-total");
const kpiTech = document.getElementById("kpi-tech");
const kpiMedical = document.getElementById("kpi-medical");
const kpiOther = document.getElementById("kpi-other");
const kpiTotalDelta = document.getElementById("kpi-total-delta");
const kpiTechDelta = document.getElementById("kpi-tech-delta");
const kpiMedicalDelta = document.getElementById("kpi-medical-delta");
const kpiOtherDelta = document.getElementById("kpi-other-delta");
const chartContainer = document.getElementById("hypemeter-chart");
const pieContainer = document.getElementById("hypemeter-pie");
const hypLastRefresh = document.getElementById("hypemeter-last-refresh");
const kpiPeriodButtons = document.querySelectorAll(".kpi-period-btn");

const HYPEMETER_CACHE_KEY = "hjalmar_hypemeter_last_data_v1";
const HYPEMETER_OVERRIDES_KEY = "hjalmar_hypemeter_category_overrides_v1";

let hypemeterDataCache = null;
let hypemeterCategoryOverrides = {};
let hypemeterSelectedPeriod = "weekly"; // "daily" | "weekly" | "monthly"

// Load persisted overrides + cache from localStorage
try {
  const storedOverrides = localStorage.getItem(HYPEMETER_OVERRIDES_KEY);
  if (storedOverrides) {
    hypemeterCategoryOverrides = JSON.parse(storedOverrides);
  }
} catch {
  hypemeterCategoryOverrides = {};
}

try {
  const storedData = localStorage.getItem(HYPEMETER_CACHE_KEY);
  if (storedData) {
    hypemeterDataCache = JSON.parse(storedData);
  }
} catch {
  hypemeterDataCache = null;
}

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#6b6b6b";
};

const normalizeHandle = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (currentMode === "x" || currentMode === "hypemeter") {
    try {
      const url = new URL(trimmed);
      if (
        url.hostname.includes("twitter.com") ||
        url.hostname.includes("x.com")
      ) {
        const parts = url.pathname.split("/").filter(Boolean);
        return parts[0] || "";
      }
    } catch (_error) {
      // Not a URL; treat as handle.
    }
    return trimmed.replace(/^@/, "").split("/")[0];
  }

  // TikTok mode - return the full URL or video ID
  try {
    const url = new URL(trimmed);
    if (
      url.hostname.includes("tiktok.com") ||
      url.hostname.includes("vm.tiktok.com")
    ) {
      return trimmed;
    }
  } catch (_error) {
    // Not a URL.
  }
  return trimmed;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const saveHypemeterCache = () => {
  if (!hypemeterDataCache) return;
  try {
    localStorage.setItem(HYPEMETER_CACHE_KEY, JSON.stringify(hypemeterDataCache));
  } catch {
    // Ignore storage errors
  }
};

const saveCategoryOverrides = () => {
  try {
    localStorage.setItem(
      HYPEMETER_OVERRIDES_KEY,
      JSON.stringify(hypemeterCategoryOverrides),
    );
  } catch {
    // Ignore storage errors
  }
};

const computeKpisFromFollowers = (followers) => {
  let tech = 0;
  let medical = 0;
  let other = 0;

  followers.forEach((f) => {
    if (f.category === "Tech / VC") tech += 1;
    else if (f.category === "Medical") medical += 1;
    else other += 1;
  });

  return {
    total: followers.length,
    tech_vc: tech,
    medical,
    other,
  };
};

const computeKpiEvolutionFromTimeline = (timeline) => {
  if (!timeline || timeline.length < 2) return null;

  const latest = timeline[timeline.length - 1];
  const latestTime = new Date(latest.date).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;

  const findRef = (thresholdMs) => {
    let ref = null;
    for (const s of timeline) {
      const t = new Date(s.date).getTime();
      if (latestTime - t >= thresholdMs) {
        if (!ref || t > new Date(ref.date).getTime()) {
          ref = s;
        }
      }
    }
    return ref;
  };

  const makePctBlock = (ref) => {
    if (!ref) return null;
    const pct = (curr, base) => {
      if (!base || base === 0) return null;
      return ((curr - base) / base) * 100;
    };
    return {
      total: pct(latest.total, ref.total),
      tech_vc: pct(latest.tech_vc, ref.tech_vc),
      medical: pct(latest.medical, ref.medical),
      other: pct(latest.other, ref.other),
    };
  };

  return {
    daily: makePctBlock(findRef(dayMs)),
    weekly: makePctBlock(findRef(weekMs)),
    monthly: makePctBlock(findRef(monthMs)),
  };
};

const applyKpiDeltas = (timeline) => {
  const evolution = computeKpiEvolutionFromTimeline(timeline);
  if (!evolution) {
    kpiTotalDelta.textContent = "";
    kpiTechDelta.textContent = "";
    kpiMedicalDelta.textContent = "";
    kpiOtherDelta.textContent = "";
    return;
  }

  const periodKey = hypemeterSelectedPeriod;
  const current = evolution[periodKey];
  const labelMap = {
    daily: "24h",
    weekly: "7d",
    monthly: "30d",
  };

  const formatPct = (value) => {
    if (value === null || value === undefined) return "–";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  };

  if (!current) {
    kpiTotalDelta.textContent = "";
    kpiTechDelta.textContent = "";
    kpiMedicalDelta.textContent = "";
    kpiOtherDelta.textContent = "";
    return;
  }

  const label = labelMap[periodKey] || "";

  kpiTotalDelta.textContent = `${formatPct(current.total)} vs ${label}`;
  kpiTechDelta.textContent = `${formatPct(current.tech_vc)} vs ${label}`;
  kpiMedicalDelta.textContent = `${formatPct(current.medical)} vs ${label}`;
  kpiOtherDelta.textContent = `${formatPct(current.other)} vs ${label}`;
};

const downloadCsv = (csv, handle, mode) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  let filename;
  if (mode === "x") {
    filename = `followers_${handle}.csv`;
  } else if (mode === "hypemeter") {
    filename = `hjalmar_hypemeter_${handle}.csv`;
  } else {
    filename = `tiktok_comments_${handle.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
  }
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const startScrape = async (handle) => {
  const functionUrl =
    currentMode === "hypemeter"
      ? HYPEMETER_FUNCTION_URL
      : currentMode === "x"
      ? X_FUNCTION_URL
      : TIKTOK_FUNCTION_URL;
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ handle }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to start scrape.");
  }

  const data = await response.json();
  if (!data.runId) {
    throw new Error("No runId returned from backend.");
  }

  return data.runId;
};

const pollForCsv = async (handle, runId) => {
  const functionUrl =
    currentMode === "hypemeter"
      ? HYPEMETER_FUNCTION_URL
      : currentMode === "x"
      ? X_FUNCTION_URL
      : TIKTOK_FUNCTION_URL;
  while (true) {
    await sleep(5000);
    setStatus("Still working… this can take a while.");

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ handle, runId }),
    });

    if (currentMode === "hypemeter") {
      const data = await response.json();
      if (data.status === "running") {
        continue;
      }
      if (data.status === "done") {
        hypemeterDataCache = data;
        saveHypemeterCache();
        renderHypemeterData(data);
        setStatus("Analysis ready.");
        return;
      }
      throw new Error(data.error || "Scrape failed.");
    }

    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.startsWith("text/csv")) {
      const csv = await response.text();
      downloadCsv(csv, handle, currentMode);
      setStatus("CSV downloaded.");
      return;
    }

    const data = await response.json();
    if (data.status === "running") {
      continue;
    }

    throw new Error(data.error || "Scrape failed.");
  }
};




const renderHypemeterData = (data) => {
  const { timeline, followers } = data;

  // Apply category overrides
  const followersWithOverrides = followers.map((f) => {
    const override = f.username ? hypemeterCategoryOverrides[f.username] : null;
    if (!override) return f;
    return { ...f, category: override };
  });

  const kpis = computeKpisFromFollowers(followersWithOverrides);

  // Render KPIs
  kpiTotal.textContent = kpis.total.toString();
  kpiTech.textContent = kpis.tech_vc.toString();
  kpiMedical.textContent = kpis.medical.toString();
  kpiOther.textContent = kpis.other.toString();

  // Render evolution deltas in %
  applyKpiDeltas(timeline || []);

  // Render last refresh
  if (timeline && timeline.length > 0) {
    const latest = timeline[timeline.length - 1];
    const d = new Date(latest.date || latest.created_at);
    const formatted = d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    hypLastRefresh.textContent = `Last refresh: ${formatted}`;
  } else {
    hypLastRefresh.textContent = "";
  }

  // Render followers table
  hypTbody.innerHTML = "";
  followersWithOverrides.forEach((follower) => {
    const tr = document.createElement("tr");
    const usernameCell = follower.username
      ? `<a href="${follower.profileUrl}" target="_blank" rel="noopener noreferrer">@${follower.username}</a>`
      : "";
    tr.innerHTML = `
      <td>${usernameCell}</td>
      <td>${follower.name}</td>
      <td>${follower.bio}</td>
      <td>${follower.location}</td>
      <td></td>
    `;
    const categoryCell = tr.querySelector("td:last-child");
    const select = document.createElement("select");
    ["Tech / VC", "Medical", "Other"].forEach((optionValue) => {
      const opt = document.createElement("option");
      opt.value = optionValue;
      opt.textContent = optionValue;
      select.appendChild(opt);
    });
    select.value = follower.category;
    select.addEventListener("change", () => {
      if (follower.username) {
        if (select.value === follower.category) {
          delete hypemeterCategoryOverrides[follower.username];
        } else {
          hypemeterCategoryOverrides[follower.username] = select.value;
        }
        saveCategoryOverrides();
        if (hypemeterDataCache) {
          // Force re-render with updated overrides
          renderHypemeterData(hypemeterDataCache);
        }
      }
    });
    categoryCell.appendChild(select);
    hypTbody.appendChild(tr);
  });

  // Render chart + pie
  renderHypemeterChart(timeline, kpis);
};

const renderHypemeterChart = (timeline, kpis) => {
  if (!timeline || timeline.length < 2) {
    chartContainer.innerHTML =
      '<div class="kpi-delta">Run Hypemeter a few times to see trends.</div>';
    pieContainer.innerHTML =
      '<div class="kpi-delta">Pie chart appears after first run.</div>';
    return;
  }

  const width = 560;
  const height = 160;
  const padding = 16;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const maxY = Math.max(
    ...timeline.map((s) => Math.max(s.tech_vc, s.medical, s.other)),
  );
  if (maxY === 0) {
    chartContainer.innerHTML = "";
    return;
  }

  const xStep =
    timeline.length === 1 ? innerWidth : innerWidth / (timeline.length - 1);

  const toPoint = (idx, value) => {
    const x = padding + idx * xStep;
    const y = padding + innerHeight * (1 - value / maxY);
    return `${x},${y}`;
  };

  const techPoints = timeline
    .map((s, i) => toPoint(i, s.tech_vc))
    .join(" ");
  const medicalPoints = timeline
    .map((s, i) => toPoint(i, s.medical))
    .join(" ");
  const otherPoints = timeline
    .map((s, i) => toPoint(i, s.other))
    .join(" ");

  chartContainer.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}">
      <polyline
        fill="none"
        stroke="#1f77b4"
        stroke-width="2"
        points="${techPoints}"
      />
      <polyline
        fill="none"
        stroke="#2ca02c"
        stroke-width="2"
        points="${medicalPoints}"
      />
      <polyline
        fill="none"
        stroke="#ff7f0e"
        stroke-width="2"
        points="${otherPoints}"
      />
    </svg>
  `;

  // Pie chart for category breakdown
  const totalCat = kpis.tech_vc + kpis.medical + kpis.other;
  if (!totalCat) {
    pieContainer.innerHTML =
      '<div class="kpi-delta">No followers to display.</div>';
    return;
  }

  const radius = 30;
  const circumference = 2 * Math.PI * radius;

  const segLength = (value) => (value / totalCat) * circumference;

  const techLen = segLength(kpis.tech_vc);
  const medicalLen = segLength(kpis.medical);
  const otherLen = segLength(kpis.other);

  const techOffset = 0;
  const medicalOffset = techOffset - techLen;
  const otherOffset = medicalOffset - medicalLen;

  pieContainer.innerHTML = `
    <svg viewBox="0 0 80 80" aria-label="Follower category breakdown">
      <circle
        cx="40"
        cy="40"
        r="${radius}"
        fill="none"
        stroke="#f0ebe4"
        stroke-width="10"
      />
      <circle
        cx="40"
        cy="40"
        r="${radius}"
        fill="none"
        stroke="#1f77b4"
        stroke-width="10"
        stroke-dasharray="${techLen} ${circumference}"
        stroke-dashoffset="${techOffset}"
        transform="rotate(-90 40 40)"
      />
      <circle
        cx="40"
        cy="40"
        r="${radius}"
        fill="none"
        stroke="#2ca02c"
        stroke-width="10"
        stroke-dasharray="${medicalLen} ${circumference}"
        stroke-dashoffset="${medicalOffset}"
        transform="rotate(-90 40 40)"
      />
      <circle
        cx="40"
        cy="40"
        r="${radius}"
        fill="none"
        stroke="#ff7f0e"
        stroke-width="10"
        stroke-dasharray="${otherLen} ${circumference}"
        stroke-dashoffset="${otherOffset}"
        transform="rotate(-90 40 40)"
      />
    </svg>
  `;
};

// Toggle mode
toggleX.addEventListener("click", () => {
  currentMode = "x";
  toggleX.classList.add("active");
  toggleTiktok.classList.remove("active");
  toggleHypemeter.classList.remove("active");
  subtitle.textContent = "Paste your X handle here";
  input.placeholder = "@username or https://x.com/username";
  input.value = "";
  hypPanel.classList.add("hidden");
});

toggleTiktok.addEventListener("click", () => {
  currentMode = "tiktok";
  toggleTiktok.classList.add("active");
  toggleX.classList.remove("active");
  toggleHypemeter.classList.remove("active");
  subtitle.textContent = "Paste your TikTok video URL here";
  input.placeholder = "https://www.tiktok.com/@username/video/1234567890";
  input.value = "";
  hypPanel.classList.add("hidden");
});

toggleHypemeter.addEventListener("click", async () => {
  currentMode = "hypemeter";
  toggleHypemeter.classList.add("active");
  toggleX.classList.remove("active");
  toggleTiktok.classList.remove("active");
  subtitle.textContent = "Hjalmar Hypemeter runs on @HNilsonne";
  input.placeholder = "Handle is fixed to @HNilsonne";
  input.value = "@HNilsonne";
  hypPanel.classList.remove("hidden");

  // Load latest data if available
  if (hypemeterDataCache) {
    renderHypemeterData(hypemeterDataCache);
  } else {
    // Try to fetch latest from backend
    setStatus("Loading latest Hypemeter data...");
    try {
      const response = await fetch(HYPEMETER_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ mode: "latest" }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === "done") {
          hypemeterDataCache = data;
          saveHypemeterCache();
          renderHypemeterData(data);
          setStatus("");
        } else {
          setStatus("No data yet. Click Extract to run analysis.");
        }
      } else {
        // Fall back to any cached data if available
        if (hypemeterDataCache) {
          renderHypemeterData(hypemeterDataCache);
          setStatus("");
        } else {
          setStatus("No data yet. Click Extract to run analysis.");
        }
      }
    } catch {
      if (hypemeterDataCache) {
        renderHypemeterData(hypemeterDataCache);
        setStatus("");
      } else {
        setStatus("No data yet. Click Extract to run analysis.");
      }
    }
  }
});

hypDownloadBtn.addEventListener("click", () => {
  if (!hypemeterDataCache) {
    setStatus("Run the Hypemeter first to generate data.", true);
    return;
  }

  const { kpis, followers } = hypemeterDataCache;
  let csvContent = "# KPIs\n";
  csvContent += "metric,value\n";
  csvContent += `total_followers,${kpis.total}\n`;
  csvContent += `tech_vc,${kpis.tech_vc}\n`;
  csvContent += `medical,${kpis.medical}\n`;
  csvContent += `other,${kpis.other}\n`;
  csvContent += "\n# Followers\n";
  csvContent += "username,name,bio,location,profile_url,category\n";

  followers.forEach((f) => {
    const csvEscape = (val) => {
      const s = String(val ?? "");
      if (/[",\n]/.test(s)) {
        return `"${s.replaceAll('"', '""')}"`;
      }
      return s;
    };
    csvContent += [
      csvEscape(f.username),
      csvEscape(f.name),
      csvEscape(f.bio),
      csvEscape(f.location),
      csvEscape(f.profileUrl),
      csvEscape(f.category),
    ].join(",") + "\n";
  });

  downloadCsv(csvContent, HYPE_HANDLE, "hypemeter");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  const handle =
    currentMode === "hypemeter" ? HYPE_HANDLE : normalizeHandle(input.value);
  if (!handle) {
    const errorMsg =
      currentMode === "x"
        ? "Please paste a valid X handle or URL."
        : "Please paste a valid TikTok video URL.";
    setStatus(errorMsg, true);
    return;
  }

  button.disabled = true;
  setStatus("Starting scrape…");

  try {
    const runId = await startScrape(handle);
    const statusMsg =
      currentMode === "x"
        ? "Scrape started. Fetching followers…"
        : currentMode === "hypemeter"
        ? "Scrape started. Analyzing followers…"
        : "Scrape started. Fetching comments…";
    setStatus(statusMsg);
    await pollForCsv(handle, runId);
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  } finally {
    button.disabled = false;
  }
});

// KPI period buttons wiring
kpiPeriodButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const period = btn.dataset.period;
    if (!period) return;
    hypemeterSelectedPeriod = period;
    kpiPeriodButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (hypemeterDataCache && hypemeterDataCache.timeline) {
      applyKpiDeltas(hypemeterDataCache.timeline);
    }
  });
});
