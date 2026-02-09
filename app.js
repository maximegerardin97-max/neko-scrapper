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

let hypemeterDataCache = null;

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
  const { kpis, weeklyDelta, monthlyDelta, timeline, followers } = data;

  // Render KPIs
  kpiTotal.textContent = kpis.total.toString();
  kpiTech.textContent = kpis.tech_vc.toString();
  kpiMedical.textContent = kpis.medical.toString();
  kpiOther.textContent = kpis.other.toString();

  // Render deltas
  const formatDelta = (delta) => {
    if (!delta) return "";
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta}`;
  };

  if (weeklyDelta && monthlyDelta) {
    kpiTotalDelta.textContent = `1w: ${formatDelta(weeklyDelta.total)}, 1m: ${formatDelta(monthlyDelta.total)}`;
    kpiTechDelta.textContent = `1w: ${formatDelta(weeklyDelta.tech_vc)}, 1m: ${formatDelta(monthlyDelta.tech_vc)}`;
    kpiMedicalDelta.textContent = `1w: ${formatDelta(weeklyDelta.medical)}, 1m: ${formatDelta(monthlyDelta.medical)}`;
    kpiOtherDelta.textContent = `1w: ${formatDelta(weeklyDelta.other)}, 1m: ${formatDelta(monthlyDelta.other)}`;
  } else {
    kpiTotalDelta.textContent = "";
    kpiTechDelta.textContent = "";
    kpiMedicalDelta.textContent = "";
    kpiOtherDelta.textContent = "";
  }

  // Render followers table
  hypTbody.innerHTML = "";
  followers.forEach((follower) => {
    const tr = document.createElement("tr");
    const usernameCell = follower.username
      ? `<a href="${follower.profileUrl}" target="_blank" rel="noopener noreferrer">@${follower.username}</a>`
      : "";
    tr.innerHTML = `
      <td>${usernameCell}</td>
      <td>${follower.name}</td>
      <td>${follower.bio}</td>
      <td>${follower.location}</td>
      <td>${follower.category}</td>
    `;
    hypTbody.appendChild(tr);
  });

  // Render chart
  renderHypemeterChart(timeline);
};

const renderHypemeterChart = (timeline) => {
  if (!timeline || timeline.length < 2) {
    chartContainer.innerHTML = "<div class=\"kpi-delta\">Run Hypemeter a few times to see trends.</div>";
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
    // Try to fetch latest
    setStatus("Loading latest Hypemeter data...");
    try {
      const response = await fetch(HYPEMETER_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ handle: HYPE_HANDLE }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === "done") {
          hypemeterDataCache = data;
          renderHypemeterData(data);
          setStatus("");
        } else {
          setStatus("No data yet. Click Extract to run analysis.");
        }
      } else {
        setStatus("No data yet. Click Extract to run analysis.");
      }
    } catch {
      setStatus("No data yet. Click Extract to run analysis.");
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
