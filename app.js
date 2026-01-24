const FUNCTION_URL =
  "https://cqlopsqqqzzkfpmcntbv.supabase.co/functions/v1/x-scrapper";

const form = document.getElementById("scrape-form");
const input = document.getElementById("handle-input");
const statusEl = document.getElementById("status");
const button = document.getElementById("extract-btn");

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#6b6b6b";
};

const normalizeHandle = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

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
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  const handle = normalizeHandle(input.value);
  if (!handle) {
    setStatus("Please paste a valid X handle or URL.", true);
    return;
  }

  button.disabled = true;
  setStatus("Fetching followers. This can take a moment...");

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ handle }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Request failed.");
    }

    const csv = await response.text();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `followers_${handle}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setStatus("CSV downloaded.");
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  } finally {
    button.disabled = false;
  }
});
