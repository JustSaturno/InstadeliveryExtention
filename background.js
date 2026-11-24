// =====================================================================
// background.js
// This file runs in the background, even when the side panel is closed.
// It has 2 jobs:
//   1. Open the side panel when you click the extension icon.
//   2. "Listen" to the requests the InstaDelivery editor makes, to
//      steal (borrow) the login token and the store ID from them.
// =====================================================================

// ---------------------------------------------------------------------
// JOB 1: clicking the toolbar icon opens the side panel
// ---------------------------------------------------------------------
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("sidePanel:", error));

// ---------------------------------------------------------------------
// JOB 2a: capture the token and the store ID
// This runs every time the browser SENDS a request to InstaDelivery.
// ---------------------------------------------------------------------
chrome.webRequest.onSendHeaders.addListener(
  async (details) => {
    // tabId -1 means the request came from the extension itself.
    // We ignore those, we only care about the editor tab's requests.
    if (details.tabId === -1) return;

    const headers = details.requestHeaders || [];

    // --- Token: it travels in the "authorization" header ---
    const authHeader = headers.find(
      (header) => header.name.toLowerCase() === "authorization"
    );
    if (authHeader) {
      const saved = await chrome.storage.session.get("token");
      // Only save if it is a new token (avoids useless writes)
      if (saved.token !== authHeader.value) {
        await chrome.storage.session.set({
          token: authHeader.value,
          tokenAt: Date.now(),
        });
      }
    }

    // --- Store ID: it appears in the URL  /api/stores/group/12345 ---
    // The (\d+) part captures the number at the end.
    const urlMatch = details.url.match(/\/api\/stores\/group\/(\d+)$/);
    if (urlMatch && details.method === "GET") {
      const storeId = urlMatch[1];
      chrome.storage.session.set({ storeId: storeId });
    }

    // --- For saves (POST, DELETE...), also remember the content-type ---
    const isSave = details.method !== "GET" && details.method !== "OPTIONS";
    if (isSave) {
      const contentTypeHeader = headers.find(
        (header) => header.name.toLowerCase() === "content-type"
      );
      if (contentTypeHeader) {
        addContentTypeToCapture(details.requestId, contentTypeHeader.value);
      }
    }
  },
  { urls: ["https://app.instadelivery.com.br/*"] }, // only this site
  ["requestHeaders", "extraHeaders"]
);

// The content-type arrives in a different moment than the body.
// So we try up to 5 times (waiting 100 ms between tries) until the
// body was already saved in the "captured" list, then we add the
// content-type to it.
async function addContentTypeToCapture(requestId, contentType) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const saved = await chrome.storage.session.get("captured");
    const captured = saved.captured || [];

    const entry = captured.find((item) => item.id === requestId);
    if (entry) {
      entry.contentType = contentType;
      await chrome.storage.session.set({ captured: captured });
      return; // done
    }

    // Not there yet, wait 100 ms and try again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Tries to turn text into a JSON object. If it is not JSON, returns the text.
function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

// ---------------------------------------------------------------------
// JOB 2b: record the saves done in the platform's own editor
// This is for the "Dev" tab: it shows how the platform saves things,
// so we can copy that behavior in new features.
// ---------------------------------------------------------------------
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId === -1) return; // ignore the extension's own requests
    if (details.method === "GET" || details.method === "OPTIONS") return; // only saves

    const requestBody = details.requestBody;
    let body = null;

    if (requestBody && requestBody.formData) {
      // Form data: { field: [values] }. Cut very long values to keep it small.
      body = {};
      for (const [field, values] of Object.entries(requestBody.formData)) {
        body[field] = values.map((value) => {
          const isLongText = typeof value === "string" && value.length > 200;
          return isLongText
            ? value.slice(0, 200) + `...(${value.length} chars)`
            : value;
        });
      }
    } else if (requestBody && requestBody.raw && requestBody.raw.length > 0) {
      // Raw data (like JSON sent as text)
      body = requestBody.raw.map((part) => {
        if (part.file) return { file: part.file };

        const size = part.bytes ? part.bytes.byteLength : 0;
        const text = part.bytes
          ? new TextDecoder().decode(part.bytes.slice(0, 2000))
          : "";

        if (size <= 2000) return tryParseJson(text);
        return { large_or_binary: `${size} bytes`, start: text.slice(0, 200) };
      });

      // If there is only one part, no need for a list
      if (body.length === 1) body = body[0];
    }

    // Add to the list and keep only the last 15 captures
    const saved = await chrome.storage.session.get("captured");
    const captured = saved.captured || [];
    captured.push({
      id: details.requestId,
      method: details.method,
      url: details.url,
      body: body,
    });
    await chrome.storage.session.set({ captured: captured.slice(-15) });
  },
  { urls: ["https://app.instadelivery.com.br/api/*"] },
  ["requestBody"]
);
