const X_FUNCTION_URL =
  "https://cqlopsqqqzzkfpmcntbv.supabase.co/functions/v1/x-scrapper";
const TIKTOK_FUNCTION_URL =
  "https://cqlopsqqqzzkfpmcntbv.supabase.co/functions/v1/tiktok-comments-scraper";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxbG9wc3FxcXp6a2ZwbWNudGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxMjUxNDMsImV4cCI6MjA3ODcwMTE0M30.J3vuzmF7cG3e6ZMx_NwHtmTIqQKJvKP1cGOXcoXBaX0";

let currentMode = "x";

const form = document.getElementById("scrape-form");
const input = document.getElementById("handle-input");
const statusEl = document.getElementById("status");
const button = document.getElementById("extract-btn");
const subtitle = document.getElementById("subtitle");
const toggleX = document.getElementById("mode-toggle");
const toggleTiktok = document.getElementById("mode-toggle-tiktok");

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#6b6b6b";
};

const normalizeHandle = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (currentMode === "x") {
    try {
      const url = new URL(trimmed);
      if (url.hostname.includes("twitter.com") || url.hostname.includes("x.com")) {
        const parts = url.pathname.split("/").filter(Boolean);
        return parts[0] || "";
      }
    } catch (error) {
      // Not a URL; treat as handle.
    }
    return trimmed.replace(/^@/, "").split("/")[0];
  } else {
    // TikTok mode - return the full URL or video ID
    try {
      const url = new URL(trimmed);
      if (url.hostname.includes("tiktok.com") || url.hostname.includes("vm.tiktok.com")) {
        return trimmed;
      }
    } catch (error) {
      // Not a URL.
    }
    return trimmed;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const downloadCsv = (csv, handle, mode) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  const filename = mode === "x" 
    ? `followers_${handle}.csv` 
    : `tiktok_comments_${handle.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const startScrape = async (handle) => {
  const functionUrl = currentMode === "x" ? X_FUNCTION_URL : TIKTOK_FUNCTION_URL;
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
  const functionUrl = currentMode === "x" ? X_FUNCTION_URL : TIKTOK_FUNCTION_URL;
  while (true) {
    await sleep(5000); // 5s between polls
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

// Toggle mode
toggleX.addEventListener("click", () => {
  currentMode = "x";
  toggleX.classList.add("active");
  toggleTiktok.classList.remove("active");
  subtitle.textContent = "Paste your X handle here";
  input.placeholder = "@username or https://x.com/username";
  input.value = "";
});

toggleTiktok.addEventListener("click", () => {
  currentMode = "tiktok";
  toggleTiktok.classList.add("active");
  toggleX.classList.remove("active");
  subtitle.textContent = "Paste your TikTok video URL here";
  input.placeholder = "https://www.tiktok.com/@username/video/1234567890";
  input.value = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  const handle = normalizeHandle(input.value);
  if (!handle) {
    const errorMsg = currentMode === "x" 
      ? "Please paste a valid X handle or URL." 
      : "Please paste a valid TikTok video URL.";
    setStatus(errorMsg, true);
    return;
  }

  button.disabled = true;
  setStatus("Starting scrape…");

  try {
    const runId = await startScrape(handle);
    const statusMsg = currentMode === "x"
      ? "Scrape started. Fetching followers…"
      : "Scrape started. Fetching comments…";
    setStatus(statusMsg);
    await pollForCsv(handle, runId);
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  } finally {
    button.disabled = false;
  }
});
