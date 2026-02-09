const X_FUNCTION_URL =
  "https://cqlopsqqqzzkfpmcntbv.supabase.co/functions/v1/x-scrapper";
const TIKTOK_FUNCTION_URL =
  "https://cqlopsqqqzzkfpmcntbv.supabase.co/functions/v1/tiktok-comments-scraper";
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

let hypCsvCache = "";

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
    currentMode === "x" || currentMode === "hypemeter"
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
    currentMode === "x" || currentMode === "hypemeter"
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

    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.startsWith("text/csv")) {
      const csv = await response.text();
      if (currentMode === "hypemeter") {
        hypCsvCache = csv;
        const snapshot = processHypemeterCsv(csv);
        saveSnapshot(snapshot);
        renderSnapshotDeltas();
        renderChart();
        setStatus("Analysis ready.");
      } else {
        downloadCsv(csv, handle, currentMode);
        setStatus("CSV downloaded.");
      }
      return;
    }

    const data = await response.json();
    if (data.status === "running") {
      continue;
    }

    throw new Error(data.error || "Scrape failed.");
  }
};

const classifyFollower = (name, bio) => {
  const text = `${name} ${bio}`.toLowerCase();

  const techStrong = [
    "vc",
    "venture",
    "general partner",
    " gp ",
    "gp,",
    "investor",
    "angel",
    "fund",
    "capital",
    "lp ",
    "yc ",
    "y combinator",
    "startup",
    "founder",
    "cofounder",
    "operator",
    "pre-seed",
    "pre seed",
    "seed fund",
    "series a",
    "growth",
    "product manager",
    " pm ",
    "cto",
    "ceo",
    "cso",
    "cpo",
    "ai",
    "ml",
    "saas",
    "software",
    "engineer",
    "developer",
    "builder",
    "tech ",
    "b2b",
    "b2c",
  ];

  const techWeak = [
    "portfolio",
    "accelerator",
    "incubator",
    "scaleup",
    "innovation",
    "ecosystem",
    "operator investor",
  ];

  const medicalStrong = [
    "doctor",
    " dr ",
    " dr.",
    "md",
    "physician",
    "surgeon",
    "radiology",
    "radiologist",
    "oncology",
    "oncologist",
    "cardiology",
    "neurology",
    "psych ",
    "clinic",
    "hospital",
    "er ",
    "emergency room",
    "gp (general practitioner)",
    "nurse",
    " rn ",
    "healthcare",
    "medtech",
    "patient care",
  ];

  const medicalWeak = [
    "health",
    "wellness",
    "public health",
    "epidemiology",
    "clinical",
    "therapist",
    "counselor",
    "mental health",
  ];

  let techScore = 0;
  let medicalScore = 0;

  techStrong.forEach((k) => {
    if (text.includes(k)) techScore += 3;
  });
  techWeak.forEach((k) => {
    if (text.includes(k)) techScore += 1;
  });

  medicalStrong.forEach((k) => {
    if (text.includes(k)) medicalScore += 3;
  });
  medicalWeak.forEach((k) => {
    if (text.includes(k)) medicalScore += 1;
  });

  if (techScore === 0 && medicalScore === 0) return "Other";
  if (techScore >= medicalScore) return "Tech / VC";
  return "Medical";
};

const parseCsv = (csv) => {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line) => {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = cells[idx] ?? "";
    });
    return obj;
  });
};

const STORAGE_KEY = "hjalmar_hypemeter_snapshots_v1";

const loadSnapshots = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_e) {
    return [];
  }
};

const saveSnapshots = (snapshots) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch (_e) {
    // ignore
  }
};

const saveSnapshot = (snapshot) => {
  const snapshots = loadSnapshots();
  snapshots.push(snapshot);
  // keep last 52 weeks worth
  while (snapshots.length > 60) snapshots.shift();
  saveSnapshots(snapshots);
};

const processHypemeterCsv = (csv) => {
  const rows = parseCsv(csv);

  const followers = rows.map((r) => ({
    username: r.username || "",
    name: r.name || "",
    bio: r.bio || r.description || "",
    location: r.location || "",
    profileUrl: r.profile_url || r.profileUrl || "",
  }));

  let total = 0;
  let tech = 0;
  let medical = 0;
  let other = 0;

  hypTbody.innerHTML = "";

  followers.forEach((follower) => {
    total += 1;
    const category = classifyFollower(follower.name, follower.bio);
    if (category === "Tech / VC") tech += 1;
    else if (category === "Medical") medical += 1;
    else other += 1;

    const tr = document.createElement("tr");
    const usernameCell = follower.username
      ? `<a href="${follower.profileUrl}" target="_blank" rel="noopener noreferrer">@${follower.username}</a>`
      : "";
    tr.innerHTML = `
      <td>${usernameCell}</td>
      <td>${follower.name}</td>
      <td>${follower.bio}</td>
      <td>${follower.location}</td>
      <td>${category}</td>
    `;
    hypTbody.appendChild(tr);
  });

  kpiTotal.textContent = total.toString();
  kpiTech.textContent = tech.toString();
  kpiMedical.textContent = medical.toString();
  kpiOther.textContent = other.toString();

  const snapshot = {
    date: new Date().toISOString(),
    total,
    tech,
    medical,
    other,
  };

  return snapshot;
};

const formatDelta = (current, prev) => {
  if (prev === null || prev === undefined) return "";
  const diff = current - prev;
  if (diff === 0) return "no change";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff}`;
};

const renderSnapshotDeltas = () => {
  const snapshots = loadSnapshots();
  if (snapshots.length === 0) return;

  const latest = snapshots[snapshots.length - 1];
  const now = new Date(latest.date).getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const monthMs = 30 * 24 * 60 * 60 * 1000;

  let weekRef = null;
  let monthRef = null;

  snapshots.forEach((s) => {
    const t = new Date(s.date).getTime();
    if (now - t >= weekMs && (!weekRef || t > new Date(weekRef.date).getTime())) {
      weekRef = s;
    }
    if (now - t >= monthMs && (!monthRef || t > new Date(monthRef.date).getTime())) {
      monthRef = s;
    }
  });

  const total = latest.total;
  const tech = latest.tech;
  const medical = latest.medical;
  const other = latest.other;

  const weekTotal = weekRef ? weekRef.total : null;
  const weekTech = weekRef ? weekRef.tech : null;
  const weekMedical = weekRef ? weekRef.medical : null;
  const weekOther = weekRef ? weekRef.other : null;

  const monthTotal = monthRef ? monthRef.total : null;
  const monthTech = monthRef ? monthRef.tech : null;
  const monthMedical = monthRef ? monthRef.medical : null;
  const monthOther = monthRef ? monthRef.other : null;

  const lines = [];
  lines.push(
    `1w: ${formatDelta(total, weekTotal)}, 1m: ${formatDelta(
      total,
      monthTotal,
    )}`,
  );
  kpiTotalDelta.textContent = lines[0];

  kpiTechDelta.textContent = `1w: ${formatDelta(
    tech,
    weekTech,
  )}, 1m: ${formatDelta(tech, monthTech)}`;
  kpiMedicalDelta.textContent = `1w: ${formatDelta(
    medical,
    weekMedical,
  )}, 1m: ${formatDelta(medical, monthMedical)}`;
  kpiOtherDelta.textContent = `1w: ${formatDelta(
    other,
    weekOther,
  )}, 1m: ${formatDelta(other, monthOther)}`;
};

const renderChart = () => {
  const snapshots = loadSnapshots();
  if (snapshots.length < 2) {
    chartContainer.innerHTML = "<div class=\"kpi-delta\">Run Hypemeter a few times to see trends.</div>";
    return;
  }

  const width = 560;
  const height = 160;
  const padding = 16;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const maxY = Math.max(
    ...snapshots.map((s) => Math.max(s.tech, s.medical, s.other)),
  );
  if (maxY === 0) {
    chartContainer.innerHTML = "";
    return;
  }

  const xStep =
    snapshots.length === 1 ? innerWidth : innerWidth / (snapshots.length - 1);

  const toPoint = (idx, value) => {
    const x = padding + idx * xStep;
    const y = padding + innerHeight * (1 - value / maxY);
    return `${x},${y}`;
  };

  const techPoints = snapshots
    .map((s, i) => toPoint(i, s.tech))
    .join(" ");
  const medicalPoints = snapshots
    .map((s, i) => toPoint(i, s.medical))
    .join(" ");
  const otherPoints = snapshots
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

toggleHypemeter.addEventListener("click", () => {
  currentMode = "hypemeter";
  toggleHypemeter.classList.add("active");
  toggleX.classList.remove("active");
  toggleTiktok.classList.remove("active");
  subtitle.textContent = "Hjalmar Hypemeter runs on @HNilsonne";
  input.placeholder = "Handle is fixed to @HNilsonne";
  input.value = "@HNilsonne";
  hypPanel.classList.remove("hidden");
  renderSnapshotDeltas();
  renderChart();
});

hypDownloadBtn.addEventListener("click", () => {
  if (!hypCsvCache) {
    setStatus("Run the Hypemeter first to generate data.", true);
    return;
  }
  downloadCsv(hypCsvCache, HYPE_HANDLE, "hypemeter");
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
