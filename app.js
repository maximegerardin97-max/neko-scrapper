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
    } catch (error) {
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
        processHypemeterCsv(csv);
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

  const techKeywords = [
    "founder",
    "cofounder",
    "startup",
    "vc",
    "venture",
    "angel",
    "product",
    "engineer",
    "developer",
    "software",
    "ai",
    "ml",
    "saas",
  ];
  const medicalKeywords = [
    "doctor",
    "md",
    "dr ",
    "dr.",
    "physician",
    "clinic",
    "hospital",
    "patient",
    "health",
    "medical",
    "nurse",
  ];

  if (techKeywords.some((k) => text.includes(k))) return "Tech / VC";
  if (medicalKeywords.some((k) => text.includes(k))) return "Medical";
  return "Other";
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
