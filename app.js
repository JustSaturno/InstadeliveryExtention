"use strict";

// =====================================================================
// app.js  -  the code that runs inside the side panel (app.html)
//
// How to read this file (top to bottom):
//   1.  Basic setup (shortcuts, options, small helper functions)
//   2.  Options + theme + Basic/Advanced mode
//   3.  Tabs
//   4.  Talking to the platform (api function)
//   5.  Images (and 5b the image bank, 5c the STORE NAME)
//   6.  Export format
//   7.  EXPORT button (and "Copiar prompt + menu + pedido")
//   8.  Import box (where you paste the AI's JSON)
//   9.  DIFF: compare the original menu with the edited one
//   10. PREVIEW: show the list of changes (with tick boxes)
//   11. Build the request bodies (what we send to the platform)
//   12. APPLY: send everything to the platform (progress, history)
//   12b. UNDO the last apply
//   13. ADVANCED tab (it is still called "dev" inside the code)
//   13b. WIPE THE WHOLE STORE (danger zone)
//   14. Support: how-to guide and diagnostic report
//   15. Start
//
// Some helper functions live in menu-helpers.js (loaded before this file):
// the list of item fields, how to compare them, history, diagnostic text...
// =====================================================================


// =====================================================================
// 1. BASIC SETUP
// =====================================================================

// Shortcut to find ONE element on the page. Example: $("#btnExport")
function $(selector, parent = document) {
  return parent.querySelector(selector);
}

// Shortcut to find MANY elements. Returns a real list (array).
function $$(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

// The base address of the platform's API
const API = "https://app.instadelivery.com.br/api";

// The default value of every option. Used the first time, or on reset.
const DEFAULTS = {
  autoBackup: true,
  confirmApply: true,
  allowDeletes: false,
  dryRun: false,
  copyOnExport: true,
  includeComplements: true,
  imagesEnabled: true,
  maxSide: 1200,
  quality: 0.85,
  delayMs: 0,
  theme: "auto",
  bankEnabled: true,          // use the platform's image bank automatically
  bankReplaceExisting: false, // also replace images that items already have
  logoFallback: false,        // new items that find no picture get the store logo
  bankMinRecall: 0.6,         // how strict the match is (0.8 strict, 0.4 flexible)
  bankGroupsEnabled: true,    // also pick banner images for groups
  groupBannerMode: "bank-url", // how a group banner is sent (see attachGroupImage)

  // ----- added in version 2.5 (additions) -----
  advancedMode: false,   // false = simple screen. true = shows the Avançado tab and technical options
  simulateFirst: true,   // the 1st click on Apply only SIMULATES, the 2nd sends for real
  maxChanges: 50,        // above this number of changes, ask one more confirmation
  typeToDelete: true,    // to delete items, the person must type APAGAR
  typeStoreName: false,  // to apply, the person must type the store name
  helpDismissed: false,  // true after the person closes the "Como usar" guide
};

// The options currently in use (starts as a copy of the defaults)
let opts = { ...DEFAULTS };

// Which fields we are allowed to edit in a group
const GROUP_FIELDS = ["name", "description", "order", "is_invisible"];

// The item fields (ITEM_FIELDS) and the function valuesDiffer() are in
// menu-helpers.js, together with the checks for each field.

// After a SIMULATION, this is true. The next click on Apply sends for real.
// (It goes back to false when a new preview is made, or a tick box changes.)
let simulatedOnce = false;


// ---------- small helper functions ----------

// Waits some milliseconds. Use with await:  await sleep(500)
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// An id means "this is NEW" when it is null, undefined, 0 or empty text
function isNewId(id) {
  return id === null || id === undefined || id === 0 || id === "";
}

// Is this text an https link?
function isHttpsUrl(text) {
  if (typeof text !== "string") return false;
  return /^https:\/\/\S+$/i.test(text.trim());
}

// Does this item have a filled "image_url"?
function hasImageUrl(item) {
  return typeof item.image_url === "string" && item.image_url.trim() !== "";
}

// Short name for JSON.stringify (turns a value into text)
function toText(value) {
  return JSON.stringify(value);
}

// Same, but pretty (with line breaks and indentation)
function toPrettyText(value) {
  return JSON.stringify(value, null, 2);
}

// Turns a name into a safe file name.
// Example: "Pão de Queijo!" -> "pao-de-queijo"
function makeSlug(name) {
  let text = name || "item";

  // 1. Remove accents (ã -> a, é -> e)
  text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 2. Lower case
  text = text.toLowerCase();

  // 3. Everything that is not a letter or number becomes "-"
  text = text.replace(/[^a-z0-9]+/g, "-");

  // 4. Remove "-" from the start and the end
  text = text.replace(/^-|-$/g, "");

  // 5. Keep at most 40 characters
  text = text.slice(0, 40);

  // If nothing is left, use "item"
  return text || "item";
}

// Turns a timestamp (number) into a time like "14:32:05"
function formatTime(timestamp) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleTimeString();
}

// Turns a timestamp into "5s atrás", "3 min atrás", "2 h atrás"
function timeAgo(timestamp) {
  if (!timestamp) return "agora mesmo";

  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s atrás`;

  const minutes = Math.round(seconds / 60);
  if (seconds < 3600) return `${minutes} min atrás`;

  const hours = Math.round(seconds / 3600);
  return `${hours} h atrás`;
}

// Creates an HTML element in one line.
// Example: createElement("div", "box", "Hello")  ->  <div class="box">Hello</div>
function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// Shows a small message at the bottom of the screen
let toastTimer;
function toast(message, kind = "ok") {
  const box = $("#toast");
  box.textContent = message;
  box.className = `toast show ${kind}`;

  clearTimeout(toastTimer);
  const duration = kind === "err" ? 6000 : 2200; // errors stay longer
  toastTimer = setTimeout(() => {
    box.className = "toast";
  }, duration);
}

// Puts a button in "working..." mode (and back to normal)
function setBusy(button, isBusy, workingText) {
  if (isBusy) {
    button.dataset.label = button.textContent; // remember the original text
    button.textContent = workingText || "Trabalhando...";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

// Downloads a text as a file
function downloadFile(fileName, text) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = fileName;
  link.click();
  // Free the memory after 2 seconds
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

// Copies a text to the clipboard
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado");
  } catch (error) {
    toast("Não foi possível copiar. Selecione o texto e copie à mão.", "err");
  }
}


// =====================================================================
// 2. OPTIONS + THEME
// =====================================================================

// Sets the light or dark theme on the page
function applyTheme() {
  const systemIsDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const useDark = opts.theme === "dark" || (opts.theme === "auto" && systemIsDark);
  document.documentElement.dataset.theme = useDark ? "dark" : "light";
}
// If the system theme changes while the panel is open, update too
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

// The Apply button text changes in dry run mode
function updateApplyButtonText() {
  let text = "Aplicar mudanças";
  if (opts.dryRun) text = "Simulação (não envia nada)";
  else if (opts.simulateFirst && !simulatedOnce) text = "Simular mudanças";
  else if (opts.simulateFirst && simulatedOnce) text = "Agora aplicar de verdade";
  $("#btnApply").textContent = text;
}

// Basic mode hides the technical parts. The CSS does the hiding:
// everything with the class "adv-only" disappears unless <body> has the class "advanced".
function applyMode() {
  document.body.classList.toggle("advanced", Boolean(opts.advancedMode));

  // If the person turned advanced mode OFF while looking at that tab, leave it
  const activeTab = $(".tab.active");
  if (!opts.advancedMode && activeTab && activeTab.id === "tab-dev") showTab("json");
}

// Puts the saved option values into the switches and selects of the Options tab
function showOptionsOnScreen() {
  for (const field of $$("[data-opt]")) {
    const name = field.dataset.opt;
    if (field.type === "checkbox") {
      field.checked = Boolean(opts[name]);
    } else {
      field.value = String(opts[name]);
    }
  }
  updateApplyButtonText();
}

// When the user changes any option, save it
for (const field of $$("[data-opt]")) {
  field.addEventListener("change", () => {
    const name = field.dataset.opt;

    // Checkbox gives true/false, select gives text
    let value = field.type === "checkbox" ? field.checked : field.value;

    // Fields marked with data-num hold numbers (convert text to number)
    if (field.dataset.num) value = Number(value);

    opts[name] = value;
    chrome.storage.local.set({ options: opts });
    applyTheme();
    applyMode();
    simulatedOnce = false; // options changed: simulate again
    updateApplyButtonText();
    toast("Salvo");
  });
}

// Loads the options saved before (if any)
async function loadOptions() {
  const saved = await chrome.storage.local.get("options");
  opts = { ...DEFAULTS, ...(saved.options || {}) };
  applyTheme();
  applyMode();
  showOptionsOnScreen();
}


// =====================================================================
// 3. TABS
// =====================================================================

function showTab(name) {
  // If the name is not valid, go to the JSON tab
  if (!["json", "history", "options", "dev"].includes(name)) name = "json";

  // The Avançado tab (called "dev") only exists in advanced mode
  if (name === "dev" && !opts.advancedMode) name = "json";

  // Show only the chosen tab
  for (const tab of $$(".tab")) {
    tab.classList.toggle("active", tab.id === `tab-${name}`);
  }
  // Highlight only the chosen button
  for (const button of $$(".tabs button")) {
    button.classList.toggle("active", button.dataset.tab === name);
  }

  history.replaceState(null, "", `#${name}`);
  if (name === "dev") showDevTab();
  if (name === "history") renderHistory();
}

for (const button of $$(".tabs button")) {
  button.onclick = () => showTab(button.dataset.tab);
}


// =====================================================================
// 4. TALKING TO THE PLATFORM
// Every request goes through api(), so everything is logged.
// =====================================================================

let requestLog = []; // list of all requests sent

function addToRequestLog(entry) {
  requestLog.push(entry);
  // Keep only the last 200
  if (requestLog.length > 200) requestLog = requestLog.slice(-200);
  chrome.storage.session.set({ reqLog: requestLog });
  // If the Avançado tab (id "dev") is open, update it right now
  if ($("#tab-dev").classList.contains("active")) showRequestLog();
}

// Sends a request to the platform.
//   method: "GET", "POST" or "DELETE"
//   path:   the end of the address, like "/stores/item/5"
//   options: { body (FormData), json (object), label (name for the log),
//              quiet (true = do not show errors in the log, for "maybe" requests) }
// Returns the answer as text.
async function api(method, path, { body, json, label, quiet } = {}) {
  // The token was captured by background.js
  const saved = await chrome.storage.session.get("token");
  const token = saved.token;
  if (!token) {
    throw new Error("Ainda sem token. Abra o editor de menu em outra aba e recarregue (F5).");
  }

  const headers = { accept: "application/json", authorization: token };
  let payload = body;

  // If we got a "json" object, send it as JSON text
  if (json !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(json);
  }

  // This is what we write in the log
  const entry = { t: Date.now(), method: method, path: path, label: label || "" };
  if (body instanceof FormData) {
    entry.fields = new Set([...body.keys()]).size; // how many different fields
  }

  const startTime = performance.now();
  try {
    const response = await fetch(API + path, { method, headers, body: payload });
    const text = await response.text();

    entry.status = response.status;
    entry.ms = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const hint = response.status === 401
        ? " (token expirado: recarregue a aba do editor com F5 e tente de novo)"
        : "";
      entry.error = text.slice(0, 300);
      throw new Error(`${response.status}${hint} ${text}`.slice(0, 320));
    }
    // Saving things answers with data that often contains the store.
    // We use it to learn the store NAME (see section 5c).
    if (method === "POST" || method === "PUT") learnStoreNameFrom(text);
    return text;
  } catch (error) {
    // "Failed to fetch" means the request did not even leave (no internet, VPN, etc.)
    if (error instanceof TypeError) {
      error = new Error("Sem conexão com a plataforma (a internet caiu?). Verifique a conexão e tente de novo.");
    }
    if (!entry.error) entry.error = error.message;
    throw error;
  } finally {
    // "finally" always runs, with success or with error
    if (!(quiet && entry.error)) addToRequestLog(entry);
    // Pause after saves (not after reads), if the user asked for it
    if (opts.delayMs && method !== "GET") await sleep(opts.delayMs);
  }
}

// Gets something and turns the text into a JSON object
async function getJson(path) {
  const text = await api("GET", path);
  return JSON.parse(text);
}

function fetchMenu(storeId) {
  return getJson(`/stores/group/${storeId}`);
}

function fetchComplements(storeId) {
  return getJson(`/stores/group-complements/${storeId}`);
}


// =====================================================================
// 5. IMAGES
// =====================================================================

// Remembers the prepared image of each item: item object -> image info
const images = new Map();

// Remembers which bank image was chosen for each item: item object -> bank image
const bankMatches = new Map();

// Items that received the STORE LOGO as their picture (see "logoFallback")
const logoItems = new Set();

// Same for groups: group object -> banner image
const groupBankMatches = new Map();

// Downloads an image from a link, shrinks it, and turns it into JPEG
async function prepareImage(url) {
  // 1. Download
  const response = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error("HTTP " + response.status);

  // 2. Check that it really is an image
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) {
    throw new Error(`não é uma imagem (${type || "tipo desconhecido"})`);
  }

  const original = await response.blob();
  if (original.size > 20 * 1024 * 1024) throw new Error("arquivo grande demais");

  // 3. Work out the new size (the longest side becomes at most maxSide)
  const bitmap = await createImageBitmap(original);
  const longestSide = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, opts.maxSide / longestSide);
  const newWidth = Math.max(1, Math.round(bitmap.width * scale));
  const newHeight = Math.max(1, Math.round(bitmap.height * scale));

  // 4. Draw the image on a canvas (a drawing board) with the new size
  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff"; // white background (transparent PNGs would turn black)
  context.fillRect(0, 0, newWidth, newHeight);
  context.drawImage(bitmap, 0, 0, newWidth, newHeight);

  // 5. Turn the canvas into a JPEG file
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", opts.quality);
  });
  if (!blob) throw new Error("não foi possível converter a imagem");

  return { blob: blob, width: newWidth, height: newHeight, bytes: blob.size };
}

// Shows a small preview of the image on the screen
function addThumbnail(label, image) {
  const figure = createElement("figure");
  const img = createElement("img");
  img.src = image.objectUrl;

  const kb = Math.round(image.bytes / 1024);
  const caption = `${label} (${image.width}x${image.height}, ${kb} KB)`;
  figure.append(img, createElement("figcaption", "", caption));
  $("#thumbs").append(figure);
}

// ---------------------------------------------------------------------
// STORE LOGO as the picture of items that found no picture
// ---------------------------------------------------------------------

// Finds the logo link of a store. The public menu answers it WITHOUT login:
//   GET /stores/by-slug/{address}   ->   { ..., design: { logo: "https://..." } }
// The "address" is the part after instadelivery.com.br/ (the store's "url").
// We read it from GET /stores/{id}, or from the answer of any save; only if both
// fail we ask the person once.
// Returns { url, slug } or { url: null, problem: "text" }.
async function getStoreLogo(storeId) {
  const saved = await chrome.storage.local.get("storeSlugs");
  const slugs = saved.storeSlugs || {};
  let slug = slugs[String(storeId)];

  if (!slug) slug = (await lookupStore(storeId)).slug;

  if (!slug) {
    const typed = prompt("Para usar o logo da loja, digite o endereço do cardápio dela (a parte depois de instadelivery.com.br/, por exemplo: komasalgadosepizza):");
    slug = cleanStoreSlug(typed);
    if (!slug) return { url: null, problem: "endereço da loja não informado, então o logo não foi usado." };
    await rememberStoreSlug(storeId, slug);
  }

  try {
    const response = await fetch(`${API}/stores/by-slug/${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
      credentials: "omit",
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const logo = pickStoreLogo(await response.json());
    if (!logo) return { url: null, problem: "a loja não tem logo cadastrado." };
    return { url: logo, slug: slug };
  } catch (error) {
    return { url: null, problem: `não consegui buscar o logo (${error.message}). Confira o endereço da loja.` };
  }
}

// NEW items that still have no picture get the logo.
// It runs after the image bank, so it only fills what the bank did not find.
// An item with  "image_url": null  is left without picture, as the AI asked.
function fillImagesWithLogo(menu, logoUrl) {
  let count = 0;
  for (const group of menu) {
    if (group._delete) continue;
    for (const item of group.itens || []) {
      if (item._delete || !item.name) continue;
      if (!(item.id === null || item.id === undefined || item.id === 0 || item.id === "")) continue; // only NEW items
      if (typeof item.image_url === "string" && item.image_url.trim() !== "") continue;
      if ("image_url" in item && item.image_url === null) continue;

      item.image_url = logoUrl;
      logoItems.add(item);
      count++;
    }
  }
  return count;
}

function clearImages() {
  for (const image of images.values()) URL.revokeObjectURL(image.objectUrl);
  images.clear();
  $("#thumbs").innerHTML = "";
}


// =====================================================================
// 5b. IMAGE BANK (the platform's ready-made product pictures)
// The matching code is in imagebank.js. Here we only download the bank
// and keep a copy, so we do not download it every time.
// =====================================================================

// The platform has TWO banks. One request each returns the WHOLE bank:
//   /images/1  -> pictures of products (used for ITEMS)
//   /images/2  -> banner pictures (used for GROUPS)
const BANK_PATHS = { items: "/images/1", groups: "/images/2" };

// Where each bank copy is saved (chrome.storage.local)
const BANK_KEYS = {
  items: { data: "imageBank", time: "imageBankAt" },
  groups: { data: "groupImageBank", time: "groupImageBankAt" },
};

// Download a bank again if our copy is older than 7 days
const BANK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Downloads a bank ("items" or "groups") and saves a slim copy
async function downloadBank(kind = "items") {
  const raw = await getJson(BANK_PATHS[kind]);

  const slim = {
    categories: (raw.categories || []).map((c) => ({ id: c.id, name: c.name })),
    images: (raw.images || []).map((i) => ({
      id: i.id,
      name: i.name,
      url: i.url,
      image_category_id: i.image_category_id,
      deleted_at: i.deleted_at,
    })),
  };

  await chrome.storage.local.set({
    [BANK_KEYS[kind].data]: slim,
    [BANK_KEYS[kind].time]: Date.now(),
  });
  return slim;
}

// Returns a bank ready to search. Uses the saved copy when it is recent.
async function getPreparedBank(kind = "items") {
  const keys = BANK_KEYS[kind];
  const saved = await chrome.storage.local.get([keys.data, keys.time]);
  let raw = saved[keys.data];

  const isOld = !saved[keys.time] || Date.now() - saved[keys.time] > BANK_MAX_AGE_MS;
  if (!raw || isOld) {
    try {
      raw = await downloadBank(kind);
    } catch (error) {
      if (!raw) throw error; // no copy at all: give up
      // otherwise keep using the old copy
    }
  }

  // Banner names contain filler words ("Fundo"), which are ignored
  const extraStopwords = kind === "groups" ? BANNER_STOPWORDS : [];
  return prepareBank(raw, extraStopwords); // prepareBank() is in imagebank.js
}

// =====================================================================
// 5c. THE STORE NAME
// The big bar at the top shows the store NAME, so nobody edits the wrong
// store by mistake. We learn the name in 3 ways:
//   1. a saved copy (chrome.storage.local, key "storeNames")
//   2. asking the platform: GET /stores/{id}  (we try it once; if the
//      platform does not answer, no problem)
//   3. from the answer of any save we do (it contains the "store" object)
// And the person can always type a name by hand (button "Trocar nome").
// =====================================================================

// The stores we already tried to look up in this session (to try only once)
const nameLookupTried = new Set();

// Saves a name: storeNames = { "43333": "Test", ... }
async function rememberStoreName(storeId, name) {
  const saved = await chrome.storage.local.get("storeNames");
  const names = saved.storeNames || {};
  if (names[String(storeId)] === name) return; // nothing new
  names[String(storeId)] = name;
  await chrome.storage.local.set({ storeNames: names });
}

// Saves the store address (slug): storeSlugs = { "43333": "lojateste", ... }
async function rememberStoreSlug(storeId, slug) {
  const saved = await chrome.storage.local.get("storeSlugs");
  const slugs = saved.storeSlugs || {};
  if (slugs[String(storeId)] === slug) return;
  slugs[String(storeId)] = slug;
  await chrome.storage.local.set({ storeSlugs: slugs });
}

// Looks inside the answer of a save, to find the store name
function learnStoreNameFrom(text) {
  try {
    const data = JSON.parse(text);
    const name = pickStoreName(data);       // from menu-helpers.js
    const id = pickStoreIdOfName(data);
    if (name && id) rememberStoreName(id, name);
    const slug = pickStoreSlug(data);
    if (slug && id) rememberStoreSlug(id, slug);
  } catch (error) {
    // not JSON, or no store inside: ignore
  }
}

// Returns the name of a store, or null if we do not know it
async function getStoreName(storeId) {
  if (!storeId) return null;

  // 1. Saved copy
  const saved = await chrome.storage.local.get("storeNames");
  const names = saved.storeNames || {};
  if (names[String(storeId)]) return names[String(storeId)];

  // 2. Ask the platform (only once per store)
  if (nameLookupTried.has(String(storeId))) return null;
  nameLookupTried.add(String(storeId));
  const info = await lookupStore(storeId);
  return info.name;
}

// Asks the platform about a store:  GET /stores/{id}  (confirmed by a capture).
// The answer is the store itself, with its "name" and its "url" (the address of
// the public menu). Both are saved for later. Returns { name, slug } (null if unknown).
async function lookupStore(storeId) {
  const info = { name: null, slug: null };
  try {
    const text = await api("GET", `/stores/${storeId}`, { label: "dados da loja", quiet: true });
    const data = JSON.parse(text);
    info.name = pickStoreName(data, true);
    info.slug = pickStoreSlug(data, true);
    if (info.name) await rememberStoreName(storeId, info.name);
    if (info.slug) await rememberStoreSlug(storeId, info.slug);
  } catch (error) {
    // The person can still type the name by hand
  }
  return info;
}

// Draws the store bar. liveId = store in the editor tab, exportedId = store of the last export
async function renderStoreBar(liveId, exportedId) {
  const bar = $("#storeBar");
  const shownId = liveId || exportedId;

  if (!shownId) {
    bar.className = "storebar nostore";
    $("#storeName").textContent = "Nenhuma loja detectada";
    $("#storeIdText").textContent = "Abra o editor de menu da loja em outra aba e recarregue (F5).";
    $("#btnRenameStore").hidden = true;
    $("#storeWarn").hidden = true;
    return;
  }

  const name = await getStoreName(shownId);
  bar.className = "storebar";
  $("#storeName").textContent = name || `Loja ${shownId}`;
  $("#storeIdText").textContent = name ? `ID ${shownId}` : `ID ${shownId} · nome não encontrado, clique em "Dar um nome"`;
  $("#btnRenameStore").hidden = false;
  $("#btnRenameStore").textContent = name ? "Trocar nome" : "Dar um nome";
  $("#btnRenameStore").dataset.storeId = String(shownId);

  // The last export is from ANOTHER store than the editor tab?
  const warn = $("#storeWarn");
  if (liveId && exportedId && String(liveId) !== String(exportedId)) {
    const exportedName = await getStoreName(exportedId);
    bar.classList.add("mismatch");
    warn.hidden = false;
    warn.textContent = 
      `Atenção: o menu exportado é da loja ${exportedName || exportedId}, mas a aba do editor está em outra loja. `
      + `Exporte de novo antes de aplicar.`;
  } else {
    warn.hidden = true;
  }
}

$("#btnRenameStore").onclick = async () => {
  const storeId = $("#btnRenameStore").dataset.storeId;
  if (!storeId) return;
  const current = (await getStoreName(storeId)) || "";
  const typed = prompt(`Nome para a loja ${storeId} (só aparece aqui na extensão):`, current);
  if (typed === null || typed.trim() === "") return;
  await rememberStoreName(storeId, typed.trim());
  showStatus();
  updateExportInfo();
};


// =====================================================================
// 6. EXPORT FORMAT
// The platform gives us a LOT of data. We keep only what the AI needs.
// =====================================================================

// Builds a map: item id -> set of complement group ids linked to it
function buildLinksByItem(complementGroups) {
  const map = new Map();
  for (const group of complementGroups) {
    for (const link of group.items || []) {
      if (!map.has(link.menu_item_id)) map.set(link.menu_item_id, new Set());
      map.get(link.menu_item_id).add(group.id);
    }
  }
  return map;
}

// A "slim" complement group, with only the useful fields
function slimComplementGroup(group) {
  return {
    id: group.id,
    name: group.name,
    min: group.min,
    max: group.max,
    only_one: Boolean(group.only_one),
    order: group.order,
    description: group.description ?? null,
    complements: (group.complements || []).map((c) => ({
      id: c.id,
      name: c.name,
      price: c.price,
      description: c.description ?? null,
      is_invisible: c.is_invisible ? 1 : 0,
      order: c.order ?? 0,
    })),
  };
}

// The slim export: { complement_groups: [...], menu: [...] }
function buildSlimExport(menu, complementGroups) {
  const linksByItem = buildLinksByItem(complementGroups);

  const slimMenu = menu.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    order: group.order,
    is_invisible: group.is_invisible,
    has_image: Boolean(group.image),
    itens: group.itens_all.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price1: item.price1,
      price2: item.price2,
      from_price: item.from_price ?? null,
      strike_price: item.strike_price ?? null,
      order: item.order,
      is_invisible: item.is_invisible,
      is_alcohol: item.is_alcohol ?? 0,
      is_highlight: item.is_highlight ?? 0,
      is_best_seller: item.is_best_seller ?? 0,
      is_newest: item.is_newest ?? 0,
      internal_id: item.internal_id ?? null,
      minimum_quantity: item.minimum_quantity ?? 0,
      days: getDaysValue(item), // "all" or a list like ["mon","tue"] (menu-helpers.js)
      has_image: Boolean(item.image),
      complement_group_ids: [...(linksByItem.get(item.id) || [])],
    })),
  }));

  return {
    complement_groups: complementGroups.map(slimComplementGroup),
    menu: slimMenu,
  };
}

// Checks what the user pasted and returns { menu, compGroups }.
// It accepts a plain list of groups OR an object with "menu".
function normalizeInput(parsed) {
  if (Array.isArray(parsed)) {
    return { menu: parsed, compGroups: null };
  }
  if (parsed && Array.isArray(parsed.menu)) {
    return { menu: parsed.menu, compGroups: parsed.complement_groups || [] };
  }
  throw new Error('Precisa ser uma lista de grupos, ou um objeto com uma lista "menu".');
}

// The text shown in the export box
function buildExportText(menu, complementGroups) {
  const slim = buildSlimExport(menu, complementGroups);
  if (opts.includeComplements) return toPrettyText(slim);
  return toPrettyText(slim.menu);
}


// =====================================================================
// 7. EXPORT BUTTON
// =====================================================================

// The line under the export box: store, groups, items, time
async function updateExportInfo() {
  const saved = await chrome.storage.local.get(["original", "exportedAt", "storeId"]);
  const original = saved.original;

  if (!original) {
    $("#exportMeta").textContent = "Nada exportado ainda";
    return;
  }

  let itemCount = 0;
  for (const group of original) itemCount += group.itens_all.length;

  const storeName = await getStoreName(saved.storeId);
  const storeText = storeName ? `${storeName} (${saved.storeId})` : saved.storeId;
  $("#exportMeta").textContent =
    `Loja ${storeText} · ${original.length} grupos · ${itemCount} itens · exportado às ${formatTime(saved.exportedAt)}`;
}

// Exports the menu into the box. Returns true if it worked.
//   copyAfter: true = also copy the JSON to the clipboard
async function runExport(copyAfter) {
  const button = $("#btnExport");

  // The store ID: typed by the user, or detected by background.js
  const detected = (await chrome.storage.session.get("storeId")).storeId;
  const storeId = $("#storeIdOverride").value.trim() || detected;
  if (!storeId) {
    toast("ID da loja não encontrado. Recarregue a página do menu na aba do editor, ou digite o ID.", "err");
    return false;
  }

  setBusy(button, true, "Exportando...");
  try {
    // Fetch the menu and the complements at the same time
    const [menu, complementGroups] = await Promise.all([
      fetchMenu(storeId),
      fetchComplements(storeId),
    ]);

    // Save a full copy. We compare against it later (in the preview).
    await chrome.storage.local.set({
      original: menu,
      originalComps: complementGroups,
      storeId: storeId,
      exportedAt: Date.now(),
    });

    $("#exportBox").value = buildExportText(menu, complementGroups);
    await updateExportInfo();
    showStatus(); // updates the store bar

    if (copyAfter) await copyText($("#exportBox").value);
    else toast("Exportado");
    return true;
  } catch (error) {
    toast(error.message, "err");
    return false;
  } finally {
    setBusy(button, false);
  }
}

$("#btnExport").onclick = () => runExport(opts.copyOnExport);

// ---------- "Copiar prompt + menu + pedido" ----------
// One click: exports the menu now (so the AI sees the CURRENT menu),
// then copies [the master prompt + the menu + my request] in one text.
// The master prompt is the file prompt.txt inside the extension.

let promptTextCache = null; // read the file only once

async function loadPromptText() {
  if (promptTextCache) return promptTextCache;
  const response = await fetch(chrome.runtime.getURL("prompt.txt"));
  if (!response.ok) throw new Error("Não achei o arquivo prompt.txt da extensão.");
  promptTextCache = await response.text();
  return promptTextCache;
}

$("#btnCopyAll").onclick = async () => {
  const button = $("#btnCopyAll");
  setBusy(button, true, "Preparando...");
  try {
    const exported = await runExport(false); // false = do not copy only the JSON
    if (!exported) return;

    const promptText = await loadPromptText();
    const message = buildAiMessage(promptText, $("#exportBox").value, $("#requestBox").value); // menu-helpers.js
    await navigator.clipboard.writeText(message);
    toast("Copiado! Agora cole na IA (Claude, ChatGPT...).");
  } catch (error) {
    toast("Não consegui copiar: " + error.message, "err");
  } finally {
    setBusy(button, false);
  }
};

// Keep what the person typed in "Meu pedido", even if the panel closes
$("#requestBox").addEventListener("input", () => {
  chrome.storage.local.set({ requestDraft: $("#requestBox").value });
});

$("#btnCopyExport").onclick = () => copyText($("#exportBox").value);

$("#btnDownloadExport").onclick = async () => {
  const saved = await chrome.storage.local.get("storeId");
  if (!$("#exportBox").value) return toast("Ainda não há nada para baixar.", "err");
  downloadFile(`menu-store-${saved.storeId || "x"}.json`, $("#exportBox").value);
};


// =====================================================================
// 8. IMPORT BOX (where you paste the AI's JSON)
// =====================================================================

// Every time the user types or pastes, check if the JSON is valid
$("#importBox").addEventListener("input", () => {
  $("#btnApply").disabled = true; // must preview again before applying

  const text = $("#importBox").value.trim();
  const state = $("#jsonState");

  if (!text) {
    state.textContent = "Vazio";
    state.className = "muted";
    return;
  }

  try {
    const input = normalizeInput(JSON.parse(text));
    state.textContent = `JSON válido · ${input.menu.length} grupo(s)`;
    state.className = "okt";
  } catch (error) {
    state.textContent = "Inválido: " + error.message;
    state.className = "errt";
  }
});

$("#btnFormat").onclick = () => {
  try {
    const parsed = JSON.parse($("#importBox").value);
    $("#importBox").value = toPrettyText(parsed);
  } catch (error) {
    toast("JSON inválido: " + error.message, "err");
  }
};

$("#btnClearImport").onclick = () => {
  $("#importBox").value = "";
  $("#importBox").dispatchEvent(new Event("input")); // refresh the state text
  $("#reviewCard").hidden = true;
  clearImages();
};

// Load a .json file into the box
$("#fileInput").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  $("#importBox").value = await file.text();
  $("#importBox").dispatchEvent(new Event("input"));
  event.target.value = ""; // allows choosing the same file again
};


// =====================================================================
// 9. DIFF: find what is different between original and edited
// =====================================================================

// Creates a function that understands a complement reference.
// A reference can be:
//   - a number  -> id of an existing complement group
//   - a text    -> name of an existing group OR of a group created in the same JSON
function makeComplementResolver(originalComps, newGroupNames) {
  const byId = new Map(originalComps.map((c) => [c.id, c]));
  const byName = new Map(originalComps.map((c) => [c.name, c]));

  return function resolve(reference) {
    if (typeof reference === "number") {
      return byId.has(reference) ? { kind: "existing", id: reference } : null;
    }
    if (typeof reference === "string") {
      if (newGroupNames.has(reference)) return { kind: "new", name: reference };
      const found = byName.get(reference);
      return found ? { kind: "existing", id: found.id } : null;
    }
    return null; // not understood
  };
}

// The fields we can edit in an EXISTING complement group and in an EXISTING option.
// "kind" tells how to compare the values: "text", "number" or "flag" (0/1).
const COMP_GROUP_FIELDS = [
  { name: "name", label: "nome", kind: "text" },
  { name: "description", label: "descrição", kind: "text" },
  { name: "min", label: "mínimo", kind: "number" },
  { name: "max", label: "máximo", kind: "number" },
  { name: "only_one", label: "apenas um", kind: "flag" },
  { name: "order", label: "ordem", kind: "number" },
];
const COMP_OPTION_FIELDS = [
  { name: "name", label: "nome", kind: "text" },
  { name: "price", label: "preço", kind: "number" },
  { name: "description", label: "descrição", kind: "text" },
  { name: "is_invisible", label: "oculto", kind: "flag" },
  { name: "order", label: "ordem", kind: "number" },
];

// Puts a value in a simple form so that two values can be compared
function normalizeCompValue(kind, value) {
  if (kind === "number") return Number(value ?? 0);
  if (kind === "flag") return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
  return String(value ?? "").trim();
}

// Compares an original record with the edited one, using a field list.
// Returns a list of { field, label, from, to } (only the fields that changed).
// A field that is missing in the edited record is NOT a change.
function diffCompRecord(originalRecord, editedRecord, fieldList) {
  const found = [];
  for (const spec of fieldList) {
    if (!(spec.name in editedRecord)) continue;
    const from = normalizeCompValue(spec.kind, originalRecord[spec.name]);
    const to = normalizeCompValue(spec.kind, editedRecord[spec.name]);
    if (from !== to) found.push({ field: spec.name, label: spec.label, from: from, to: to });
  }
  return found;
}

// Are two names the same? (ignores accents, UPPER/lower case and extra spaces)
function sameName(a, b) {
  const clean = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
  return clean(a) === clean(b);
}

// Compares the original menu with the edited one.
// Returns { changes: [...], warnings: [...] }
function computeChanges(original, originalComps, edited, editedComps) {
  const changes = [];  // things we WILL do
  const warnings = []; // things we will NOT do (with the reason)

  // +18 safety net (see menu-helpers.js): warns when the name of an item looks
  // alcoholic but "is_alcohol" is off. It only warns, it never changes anything.
  // Existing items are collected here and shown as ONE warning at the end.
  const alcoholUnflaggedExisting = [];
  function checkAlcoholOfNewItem(item) {
    const result = checkAlcoholFlag(item.name, item.is_alcohol);
    if (result === "missing") {
      warnings.push(`Item novo "${item.name}" parece bebida alcoólica, mas não está marcado como +18. Se for alcoólico, use "is_alcohol": 1.`);
    } else if (result === "wrong") {
      warnings.push(`Item novo "${item.name}" diz que não tem álcool, mas está marcado como +18. Confira o "is_alcohol".`);
    }
  }

  const originalGroups = new Map(original.map((g) => [g.id, g]));
  const originalLinks = buildLinksByItem(originalComps);
  const originalCompById = new Map(originalComps.map((c) => [c.id, c]));
  const useComplements = editedComps !== null;
  const newComplementNames = new Set();
  const deletedCompGroupIds = new Set(); // complement groups that will be deleted

  // ----- Part A: complement groups -----
  if (useComplements) {
    for (const comp of editedComps) {
      // A complement group with no id is NEW
      if (isNewId(comp.id)) {
        const options = (comp.complements || []).filter((o) => o && o.name);

        if (!comp.name || options.length === 0) {
          warnings.push(`O novo grupo de complementos "${comp.name || "(sem nome)"}" precisa de nome e de pelo menos uma opção (ignorado).`);
          continue;
        }
        if (newComplementNames.has(comp.name)) {
          warnings.push(`Dois novos grupos de complementos se chamam "${comp.name}" (o segundo foi ignorado).`);
          continue;
        }
        newComplementNames.add(comp.name);
        changes.push({ type: "comp-create", label: comp.name, comp: comp });
        continue;
      }

      // An existing group
      const originalComp = originalCompById.get(comp.id);
      if (!originalComp) {
        warnings.push(`O grupo de complementos com id ${comp.id} não existe (ignorado).`);
        continue;
      }

      // 0) Delete the whole group: only with "_delete": true (and only if deletes are allowed)
      if (comp._delete === true) {
        if (opts.allowDeletes) {
          changes.push({ type: "comp-delete", id: comp.id, label: originalComp.name });
          deletedCompGroupIds.add(comp.id);
        } else {
          warnings.push(`Grupo de complementos ${comp.id} "${originalComp.name}": exclusão ignorada, as exclusões estão desligadas nas Opções.`);
        }
        continue;
      }

      // 1) Changes in the group itself (name, min, max...)
      for (const diff of diffCompRecord(originalComp, comp, COMP_GROUP_FIELDS)) {
        if (diff.field === "name" && diff.to === "") {
          warnings.push(`O grupo de complementos ${comp.id} ficou sem nome (ignorado).`);
          continue;
        }
        changes.push({ type: "comp-update", id: comp.id, label: originalComp.name, field: diff.field, from: diff.from, to: diff.to });
      }

      // 2) Changes in the options of this group (name, price...)
      const originalOptions = new Map((originalComp.complements || []).map((o) => [o.id, o]));
      const newOptionNames = new Set();
      for (const option of comp.complements || []) {
        // A NEW option in an existing group (no id)
        if (!option || isNewId(option.id)) {
          if (!option || !option.name || !String(option.name).trim()) {
            warnings.push(`Opção nova sem nome no grupo "${originalComp.name}" (ignorada).`);
            continue;
          }
          const price = Number(option.price ?? 0);
          if (!Number.isFinite(price) || price < 0) {
            warnings.push(`A opção nova "${option.name}" tem um preço inválido (ignorada).`);
            continue;
          }
          if (newOptionNames.has(option.name) || (originalComp.complements || []).some((o) => sameName(o.name, option.name))) {
            warnings.push(`O grupo "${originalComp.name}" já tem uma opção "${option.name}" (a nova foi ignorada).`);
            continue;
          }
          newOptionNames.add(option.name);
          changes.push({ type: "option-create", groupId: comp.id, label: `${originalComp.name} › ${option.name}`, option: option });
          continue;
        }

        const originalOption = originalOptions.get(option.id);
        if (!originalOption) {
          warnings.push(`A opção ${option.id} não existe no grupo "${originalComp.name}" (ignorada).`);
          continue;
        }

        // Delete an option: only with "_delete": true (and only if deletes are allowed)
        if (option._delete === true) {
          if (opts.allowDeletes) {
            changes.push({ type: "option-delete", id: option.id, groupId: comp.id, label: `${originalComp.name} › ${originalOption.name}` });
          } else {
            warnings.push(`Opção ${option.id} "${originalOption.name}": exclusão ignorada, as exclusões estão desligadas nas Opções.`);
          }
          continue;
        }
        for (const diff of diffCompRecord(originalOption, option, COMP_OPTION_FIELDS)) {
          if (diff.field === "name" && diff.to === "") {
            warnings.push(`A opção ${option.id} "${originalOption.name}" ficou sem nome (ignorado).`);
            continue;
          }
          if (diff.field === "price" && (!Number.isFinite(diff.to) || diff.to < 0)) {
            warnings.push(`A opção "${originalOption.name}" tem um preço inválido (ignorado).`);
            continue;
          }
          changes.push({
            type: "option-update", id: option.id, groupId: comp.id,
            label: `${originalComp.name} › ${originalOption.name}`,
            field: diff.field, from: diff.from, to: diff.to,
          });
        }
      }

      // (An option that is simply missing from the list is left alone.
      //  To delete an option the JSON must say "_delete": true on it.)
    }
  }

  const resolveReference = makeComplementResolver(originalComps, newComplementNames);

  // Checks if the complement references of an item make sense
  function checkReferences(item) {
    if (!useComplements) return;
    for (const reference of item.complement_group_ids || []) {
      if (!resolveReference(reference)) {
        warnings.push(`Item "${item.name}": grupo de complementos ${toText(reference)} não encontrado (ignorado).`);
      }
    }
  }

  // ----- Part B: groups and items -----
  const seenGroups = new Set();

  for (const group of edited) {
    // --- B1. New group (no id) ---
    if (isNewId(group.id)) {
      if (group._delete) continue;
      for (const item of group.itens || []) {
        if (!item._delete) checkReferences(item);
      }
      // Same name as a group that already exists? (maybe it was created already)
      const sameNameGroup = original.find((g) => sameName(g.name, group.name));
      if (sameNameGroup) {
        warnings.push(
          `O novo grupo "${group.name}" tem o mesmo nome de um grupo que já existe (id ${sameNameGroup.id}). `
          + `Vai ser criado outro, repetido. `
          + `Se não era isso, desmarque a mudança.`);
      }
      // The items of a new group get the +18 check too
      for (const newItem of group.itens || []) {
        if (!newItem._delete) checkAlcoholOfNewItem(newItem);
      }
      changes.push({ type: "group-create", label: group.name, group: group });
      continue;
    }

    // --- B2. Existing group ---
    const originalGroup = originalGroups.get(group.id);
    if (!originalGroup) {
      warnings.push(`O grupo com id ${group.id} não existe no original (ignorado). Para criar um grupo, remova o id dele.`);
      continue;
    }
    seenGroups.add(group.id);

    if (group._delete) {
      warnings.push(`Grupo ${group.id} "${originalGroup.name}": apagar grupos ainda não é suportado (ignorado).`);
      continue;
    }

    // Group fields that changed
    for (const field of GROUP_FIELDS) {
      if (field in group && group[field] !== originalGroup[field]) {
        changes.push({
          type: "group-update",
          id: group.id,
          label: originalGroup.name,
          field: field,
          from: originalGroup[field],
          to: group[field],
        });
      }
    }

    // New banner image for the group?
    if (opts.imagesEnabled && hasImageUrl(group)) {
      changes.push({
        type: "group-image",
        id: group.id,
        label: originalGroup.name,
        url: group.image_url.trim(),
        groupRef: group,
      });
    }

    // Items of this group
    const originalItems = new Map(originalGroup.itens_all.map((i) => [i.id, i]));
    const seenItems = new Set();

    for (const item of group.itens || []) {
      // --- New item (no id) ---
      if (isNewId(item.id)) {
        if (!item._delete) {
          checkReferences(item);

          // Same name as an item that is already in this group? Warn (maybe it was already created).
          const sameNameItem = originalGroup.itens_all.find((i) => sameName(i.name, item.name));
          if (sameNameItem) {
            warnings.push(
              `O novo item "${item.name}" tem o mesmo nome de um item que já existe no grupo "${originalGroup.name}" (id ${sameNameItem.id}). `
              + `Vai ser criado outro, repetido. `
              + `Se não era isso, desmarque a mudança.`);
          }

          // Check the extra fields of the new item (price, flags, days...)
          // A field with a problem is removed from the item (the default is used instead)
          let skipItem = false;
          for (const field of ITEM_FIELDS) {
            if (!(field in item)) continue;
            const problem = checkFieldValue(field, item[field]);
            if (!problem) continue;
            if (field === "name") {
              warnings.push(`Um item novo sem nome foi ignorado (${problem}).`);
              skipItem = true;
            } else {
              warnings.push(`Item novo "${item.name}": ${problem}. Vai ser criado com o valor padrão.`);
              delete item[field];
            }
          }
          if (skipItem) continue;
          checkAlcoholOfNewItem(item);
          changes.push({ type: "create", groupId: group.id, label: item.name, item: item });
        }
        continue;
      }

      // --- Existing item ---
      const originalItem = originalItems.get(item.id);
      if (!originalItem) {
        warnings.push(`O item com id ${item.id} ("${item.name}") não está no original (ignorado). Para criar um item, remova o id dele.`);
        continue;
      }
      seenItems.add(item.id);

      // +18 check: use the flag from the JSON if it is there, otherwise the saved one
      const flagToCheck = "is_alcohol" in item ? item.is_alcohol : originalItem.is_alcohol;
      if (checkAlcoholFlag(originalItem.name, flagToCheck) === "missing") {
        alcoholUnflaggedExisting.push(originalItem.name);
      }

      // Delete?
      if (item._delete === true) {
        if (opts.allowDeletes) {
          changes.push({ type: "delete", id: item.id, groupId: group.id, label: originalItem.name });
        } else {
          warnings.push(`Item ${item.id} "${originalItem.name}": exclusão ignorada, as exclusões estão desligadas nas Opções.`);
        }
        continue;
      }

      // Item fields that changed
      for (const field of ITEM_FIELDS) {
        if (!(field in item)) continue; // the AI did not send it: leave as it is

        // Is the new value valid? (a price like "abc" must never go to the platform)
        const problem = checkFieldValue(field, item[field]);
        if (problem) {
          warnings.push(`Item ${item.id} "${originalItem.name}": ${problem} (mudança ignorada).`);
          continue;
        }

        const oldValue = getFieldValue(originalItem, field); // "days" is built from 7 fields
        if (valuesDiffer(field, item[field], oldValue)) {
          changes.push({
            type: "update",
            id: item.id,
            groupId: group.id,
            label: originalItem.name,
            field: field,
            from: oldValue,
            to: item[field],
          });
        }
      }

      // New image?
      if (opts.imagesEnabled && hasImageUrl(item)) {
        changes.push({
          type: "image",
          id: item.id,
          groupId: group.id,
          label: originalItem.name,
          url: item.image_url.trim(),
          itemRef: item,
        });
      }

      // Complement links
      if (useComplements && Array.isArray(item.complement_group_ids)) {
        const currentLinks = originalLinks.get(item.id) || new Set();
        const wantedLinks = new Set();

        for (const reference of item.complement_group_ids) {
          const resolved = resolveReference(reference);
          if (!resolved) {
            warnings.push(`Item ${item.id} "${originalItem.name}": grupo de complementos ${toText(reference)} não encontrado (ignorado).`);
            continue;
          }
          if (resolved.kind === "existing") {
            wantedLinks.add(resolved.id);
            if (currentLinks.has(resolved.id)) continue; // already linked, nothing to do
          }
          changes.push({
            type: "link",
            itemId: item.id,
            groupId: group.id,
            label: originalItem.name,
            ref: resolved,
          });
        }

        // Links that were removed from the list = UNLINK (only if deletes are allowed)
        for (const id of currentLinks) {
          if (wantedLinks.has(id)) continue;
          if (deletedCompGroupIds.has(id)) continue; // the whole group is being deleted anyway
          const compName = originalCompById.has(id) ? originalCompById.get(id).name : id;
          if (opts.allowDeletes) {
            changes.push({
              type: "unlink", itemId: item.id, groupId: group.id, compId: id,
              label: `"${compName}" ← item "${originalItem.name}"`,
            });
          } else {
            warnings.push(`Item ${item.id} "${originalItem.name}": o grupo de complementos "${compName}" foi tirado da lista, mas as exclusões estão desligadas nas Opções (ignorado).`);
          }
        }
      }
    }

    // Items that exist in the original but are missing in the edited JSON
    for (const [id, originalItem] of originalItems) {
      if (!seenItems.has(id)) {
        warnings.push(`O item ${id} ("${originalItem.name}") está faltando no seu JSON. Ele NÃO será apagado.`);
      }
    }
  }

  // Groups that exist in the original but are missing in the edited JSON
  for (const [id, originalGroup] of originalGroups) {
    if (!seenGroups.has(id)) {
      warnings.push(`O grupo ${id} ("${originalGroup.name}") está faltando no seu JSON. Ele NÃO será apagado.`);
    }
  }

  // One single warning for all the existing items that look alcoholic but are not +18
  if (alcoholUnflaggedExisting.length > 0) {
    const shown = alcoholUnflaggedExisting.slice(0, 8).join(", ");
    const more = alcoholUnflaggedExisting.length > 8 ? ` e mais ${alcoholUnflaggedExisting.length - 8}` : "";
    warnings.push(
      `${alcoholUnflaggedExisting.length} item(ns) existente(s) parecem bebida alcoólica mas não estão marcados como +18: ${shown}${more}. `
      + `Se forem alcoólicos, envie "is_alcohol": 1 nesses itens.`);
  }

  return { changes, warnings };
}


// =====================================================================
// 10. PREVIEW (the review card)
// =====================================================================

let pending = []; // the changes waiting to be applied

// Turns one change into 3 texts: [css class, badge text, description]
function describeChange(change) {
  // Small helper to show which complements an item links to
  function linksText(item) {
    const ids = item.complement_group_ids || [];
    if (ids.length === 0) return "";
    const shown = ids.map((x) => (typeof x === "string" ? `"${x}"` : x)).join(", ");
    return ` · liga ${shown}`;
  }

  switch (change.type) {
    case "group-create": {
      const itemCount = (change.group.itens || []).filter((i) => !i._delete).length;
      const withBanner = images.has(change.group) ? " · com banner" : "";
      return ["create", "NOVO GRUPO", `"${change.label}" com ${itemCount} item(ns)${withBanner}`];
    }
    case "group-image": {
      const bankImage = groupBankMatches.get(change.groupRef);
      const source = bankImage ? `banco de banners: ${bankImage.name}` : change.url.slice(0, 70);
      return ["image", "BANNER", `grupo "${change.label}" ← ${source}`];
    }
    case "group-update":
      return ["edit", "EDITAR GRUPO", `"${change.label}": ${change.field}  ${toText(change.from)} → ${toText(change.to)}`];

    case "create": {
      const price = change.item.price1 ?? "?";
      const fromText = change.item.from_price ? ` · a partir de ${change.item.from_price}` : "";
      const withImage = images.has(change.item) ? " · com imagem" : "";
      return ["create", "NOVO ITEM", `"${change.label}" · preço ${price}${fromText} · grupo ${change.groupId}${withImage}${linksText(change.item)}`];
    }
    case "delete":
      return ["delete", "APAGAR", `item "${change.label}" (${change.id})`];

    case "image": {
      const bankImage = bankMatches.get(change.itemRef);
      const source = bankImage ? `banco de imagens: ${bankImage.name}`
        : logoItems.has(change.itemRef) ? "logo da loja"
        : change.url.slice(0, 70);
      return ["image", "IMAGEM", `"${change.label}" ← ${source}`];
    }

    case "comp-create": {
      const optionCount = (change.comp.complements || []).filter((o) => o && o.name).length;
      const min = change.comp.min ?? 0;
      const max = change.comp.max ?? optionCount;
      return ["create", "NOVO COMPLEMENTO", `"${change.label}" (mín ${min}, máx ${max}) com ${optionCount} opção(ões)`];
    }
    case "comp-update": {
      const spec = COMP_GROUP_FIELDS.find((f) => f.name === change.field);
      return ["edit", "EDITAR COMPLEMENTO", `grupo "${change.label}": ${spec.label}  ${describeCompValue(spec, change.from)} → ${describeCompValue(spec, change.to)}`];
    }
    case "option-update": {
      const spec = COMP_OPTION_FIELDS.find((f) => f.name === change.field);
      return ["edit", "EDITAR OPÇÃO", `${change.label}: ${spec.label}  ${describeCompValue(spec, change.from)} → ${describeCompValue(spec, change.to)}`];
    }
    case "option-create": {
      const price = Number(change.option.price ?? 0);
      return ["create", "NOVA OPÇÃO", `${change.label} (R$ ${price.toFixed(2).replace(".", ",")})`];
    }
    case "option-delete":
      return ["delete", "APAGAR OPÇÃO", `${change.label} (${change.id})`];
    case "comp-delete":
      return ["delete", "APAGAR GRUPO DE COMPLEMENTOS", `"${change.label}" (${change.id}) com todas as opções`];
    case "unlink":
      return ["delete", "DESLIGAR", `complemento ${change.label}`];
    case "link": {
      const compText = change.ref.kind === "existing" ? change.ref.id : `"${change.ref.name}"`;
      return ["link", "LIGAR", `complemento ${compText} → item ${change.itemId} "${change.label}"`];
    }
    default:
      // An item field: show its Portuguese name and readable values
      return ["edit", "EDITAR", `"${change.label}": ${fieldLabel(change.field)}  ${describeValue(change.field, change.from)} → ${describeValue(change.field, change.to)}`];
  }
}

// Shows a complement value in a readable way (price as R$, flags as sim/não)
function describeCompValue(spec, value) {
  if (spec.name === "price") return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
  if (spec.kind === "flag") return value ? "sim" : "não";
  if (spec.kind === "text") return value === "" ? "(vazio)" : `"${value}"`;
  return String(value);
}

// Draws the review card: counters, change list and warnings
function showReview(changes, warnings) {
  $("#reviewCard").hidden = false;
  $("#reviewStatus").textContent = "";

  // ----- Count each kind of change -----
  const counts = {};
  function addCount(name, amount = 1) {
    counts[name] = (counts[name] || 0) + amount;
  }

  for (const change of changes) {
    if (change.type === "group-create") {
      addCount("novos grupos");
      if (images.has(change.group)) addCount("banners");
      for (const item of change.group.itens || []) {
        if (item._delete) continue;
        addCount("novos itens");
        if (images.has(item)) addCount("imagens");
      }
    } else if (change.type === "create") {
      addCount("novos itens");
      if (images.has(change.item)) addCount("imagens");
    } else if (change.type === "update" || change.type === "group-update") {
      addCount("edições");
    } else if (change.type === "comp-update" || change.type === "option-update") {
      addCount("edições de complementos");
    } else if (change.type === "image") {
      addCount("imagens");
    } else if (change.type === "group-image") {
      addCount("banners");
    } else if (change.type === "link") {
      addCount("ligações de complementos");
    } else if (change.type === "comp-create") {
      addCount("novos grupos de complementos");
    } else if (change.type === "option-create") {
      addCount("novas opções");
    } else if (change.type === "delete" || change.type === "option-delete" || change.type === "comp-delete") {
      addCount("exclusões");
    } else if (change.type === "unlink") {
      addCount("desligamentos");
    }
  }

  // ----- Show the counters (the little "chips") -----
  const summary = $("#summary");
  summary.innerHTML = "";
  const entries = Object.entries(counts);
  if (entries.length === 0) summary.append(createElement("span", "chip", "Nenhuma mudança"));
  for (const [name, amount] of entries) {
    const extraClass = name === "exclusões" ? " danger" : "";
    summary.append(createElement("span", "chip" + extraClass, `${amount} ${name}`));
  }

  // ----- Show the list of changes, each one with a tick box -----
  const list = $("#changes");
  list.innerHTML = "";
  for (const change of changes) {
    const [kind, label, text] = describeChange(change);
    const row = createElement("label", "change");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = change.on;
    checkbox.onchange = () => {
      change.on = checkbox.checked;               // remember the choice
      row.classList.toggle("off", !change.on);    // strike the text when unticked
      refreshSelection();
    };

    row.classList.toggle("off", !change.on);
    row.append(checkbox, createElement("span", `badge ${kind}`, label), createElement("span", "ctext", text));
    list.append(row);
  }

  // ----- Show the warnings -----
  const warningBox = $("#warnings");
  warningBox.innerHTML = "";
  warningBox.hidden = warnings.length === 0;
  if (warnings.length > 0) {
    warningBox.append(createElement("strong", "", `Avisos (${warnings.length})`));
    const ul = createElement("ul");
    for (const warning of warnings) ul.append(createElement("li", "", warning));
    warningBox.append(ul);
  }

  // Can only apply if there is at least one change ticked
  refreshSelection();
}

// Updates "12 de 15 marcadas" and the Apply button
function refreshSelection() {
  const ticked = selectedChanges().length;
  $("#selectInfo").textContent = pending.length === 0 ? "" : `${ticked} de ${pending.length} mudanças marcadas`;
  $("#btnApply").disabled = ticked === 0;
  simulatedOnce = false; // the selection changed: simulate again
  updateApplyButtonText();
}

// "Marcar todas" and "Desmarcar todas"
function setAllTicks(value) {
  for (const change of pending) change.on = value;
  for (const row of $$("#changes .change")) {
    row.querySelector("input").checked = value;
    row.classList.toggle("off", !value);
  }
  refreshSelection();
}
$("#btnSelectAll").onclick = () => setAllTicks(true);
$("#btnSelectNone").onclick = () => setAllTicks(false);

// Collects every image that has to be downloaded:
// a list of { ref (the item), url, label }
function collectImageJobs(changes) {
  const jobs = [];
  for (const change of changes) {
    if (change.type === "image") {
      jobs.push({ ref: change.itemRef, url: change.url, label: change.label });
    } else if (change.type === "create" && hasImageUrl(change.item)) {
      jobs.push({ ref: change.item, url: change.item.image_url.trim(), label: change.label });
    } else if (change.type === "group-image") {
      jobs.push({ ref: change.groupRef, url: change.url, label: `Banner: ${change.label}` });
    } else if (change.type === "group-create") {
      if (hasImageUrl(change.group)) {
        jobs.push({ ref: change.group, url: change.group.image_url.trim(), label: `Banner: ${change.group.name}` });
      }
      for (const item of change.group.itens || []) {
        if (!item._delete && hasImageUrl(item)) {
          jobs.push({ ref: item, url: item.image_url.trim(), label: item.name });
        }
      }
    }
  }
  return jobs;
}

// Asks the browser for permission to download images from sites that appear in
// "image_url" fields (the extension does not have access to every site).
// If the user says no, those images are simply skipped, with a warning.
async function requestExtraImageHosts(menu) {
  const origins = new Set();

  function collect(thing) {
    if (!thing || typeof thing.image_url !== "string") return;
    try {
      const url = new URL(thing.image_url.trim());
      if (url.protocol === "https:") origins.add(`${url.origin}/*`);
    } catch (error) {
      // not a valid link: the preview will warn about it
    }
  }

  for (const group of menu) {
    collect(group);
    for (const item of group.itens || []) collect(item);
  }
  if (origins.size === 0) return;

  try {
    // Resolves right away (no question) for sites that are already allowed
    await chrome.permissions.request({ origins: Array.from(origins) });
  } catch (error) {
    // Ignored: images from sites without permission are skipped later
  }
}

// The "Ver mudanças" button
async function runPreview() {
  const button = $("#btnPreview");
  $("#btnApply").disabled = true;
  $("#applyLog").hidden = true;
  $("#applySummary").hidden = true;
  clearImages();

  // 1. Read what the user pasted
  let input;
  try {
    input = normalizeInput(JSON.parse($("#importBox").value));
  } catch (error) {
    return toast("JSON inválido: " + error.message, "err");
  }

  // 1b. Image links from OTHER sites (image_url written by the AI) need the
  //     browser's permission to download them. The extension only has built-in
  //     access to InstaDelivery and its image storage. We ask for the extra
  //     sites right here, as the first thing after the click (the browser only
  //     accepts the question while the click is "fresh").
  await requestExtraImageHosts(input.menu);

  // 2. Get the copy saved at export time
  const saved = await chrome.storage.local.get(["original", "originalComps"]);
  if (!saved.original || !saved.originalComps) {
    return toast("Faça a exportação primeiro, para ter algo para comparar.", "err");
  }

  setBusy(button, true, "Verificando...");
  try {
    // 3a. Fill "image_url" from the image bank (for items without an image).
    //     This runs BEFORE the compare step, so the rest of the code
    //     treats these images exactly like images sent by the AI.
    const bankWarnings = [];
    bankMatches.clear();
    groupBankMatches.clear();
    if (opts.imagesEnabled && (opts.bankEnabled || opts.bankGroupsEnabled)) {
      try {
        $("#reviewCard").hidden = false;
        $("#reviewStatus").textContent = "Procurando imagens no banco de imagens...";
        const bankSettings = { replaceExisting: opts.bankReplaceExisting, minRecall: opts.bankMinRecall };

        // The product bank is used for items, and also to guess a group's banner
        const itemBank = await getPreparedBank("items");

        // Items first, so the groups can use the result
        if (opts.bankEnabled) {
          fillImagesFromBank(input.menu, saved.original, itemBank, bankSettings, bankMatches, bankWarnings);
        }

        if (opts.bankGroupsEnabled) {
          const groupBank = await getPreparedBank("groups");
          fillGroupImagesFromBank(
            input.menu, saved.original, groupBank, itemBank, bankSettings,
            bankMatches, groupBankMatches, bankWarnings
          );
        }
      } catch (error) {
        bankWarnings.push("Não consegui usar o banco de imagens: " + error.message);
      }
    }

    // 3a2. New items that found no picture get the store logo (if the option is on)
    logoItems.clear();
    if (opts.imagesEnabled && opts.logoFallback) {
      $("#reviewCard").hidden = false;
      $("#reviewStatus").textContent = "Buscando o logo da loja...";
      const logo = await getStoreLogo((await chrome.storage.local.get("storeId")).storeId);
      if (logo.url) {
        const count = fillImagesWithLogo(input.menu, logo.url);
        if (count > 0) bankWarnings.push(`Logo da loja usado em ${count} item(ns) novo(s) sem foto no banco de imagens.`);
      } else {
        bankWarnings.push("Logo da loja: " + logo.problem);
      }
    }

    // 3b. Compare
    const { changes, warnings } = computeChanges(
      saved.original,
      saved.originalComps,
      input.menu,
      input.compGroups
    );
    warnings.push(...bankWarnings);

    // 4. Download and check every image
    let jobs = [];
    if (opts.imagesEnabled) {
      jobs = collectImageJobs(changes);
    } else {
      // Images are off: count how many image_url were ignored
      let ignored = 0;
      for (const group of input.menu) {
        for (const item of group.itens || []) {
          if (hasImageUrl(item)) ignored++;
        }
      }
      if (ignored > 0) {
        warnings.push(`${ignored} valor(es) de image_url ignorado(s): o envio de imagens está desligado nas Opções.`);
      }
    }

    $("#reviewCard").hidden = false;
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      $("#reviewStatus").textContent = `Verificando imagens ${i + 1}/${jobs.length}: ${job.label}...`;
      try {
        if (!isHttpsUrl(job.url)) throw new Error("não é um link https válido");

        const image = await prepareImage(job.url);
        image.name = makeSlug(job.label) + ".jpg";
        image.sourceUrl = job.url; // the original link (used by the "image-url" mode for groups)
        image.objectUrl = URL.createObjectURL(image.blob);
        images.set(job.ref, image);
        const bankImage = bankMatches.get(job.ref) || groupBankMatches.get(job.ref);
        const caption = bankImage ? `${job.label} ← banco: ${bankImage.name}`
          : logoItems.has(job.ref) ? `${job.label} ← logo da loja`
          : job.label;
        addThumbnail(caption, image);
      } catch (error) {
        warnings.push(`Imagem de "${job.label}" ignorada (${job.url.slice(0, 70)}): ${error.message}`);
      }
    }

    // 5. If an image failed, drop that image change.
    //    New items are still created, just without the image.
    pending = changes.filter((c) => {
      if (c.type === "image") return images.has(c.itemRef);
      if (c.type === "group-image") return images.has(c.groupRef);
      return true;
    });
    for (const change of pending) change.on = true; // everything starts ticked
    simulatedOnce = false;
    $("#applySummary").hidden = true;
    $("#progressWrap").hidden = true;
    showReview(pending, warnings);
  } finally {
    setBusy(button, false);
  }
}
$("#btnPreview").onclick = runPreview;


// =====================================================================
// 11. BUILD THE REQUEST BODIES
// These functions copy what the platform's own editor sends.
// The platform wants "FormData" (like an HTML form), not plain JSON.
// =====================================================================

// Fields that need a special value when they are null
const EMPTY_IF_NULL = ["custom_tag", "custom_tag2", "custom_tag3", "internal_id", "obs_placeholder", "strike_price"];
const ZERO_IF_NULL = ["price2", "cost", "minimum_quantity"];
const SKIP_IF_NULL = ["start_time", "end_time"];

// Turns a value into the text the platform expects
function toFormValue(key, value) {
  if (value === null || value === undefined) {
    if (EMPTY_IF_NULL.includes(key)) return "";
    if (ZERO_IF_NULL.includes(key)) return "0";
    return "null";
  }
  return String(value);
}

// The current date and time as "2026-11-14 15:30:00"
function nowText() {
  function twoDigits(n) {
    return String(n).padStart(2, "0"); // 5 -> "05"
  }
  const d = new Date();
  const date = `${d.getFullYear()}-${twoDigits(d.getMonth() + 1)}-${twoDigits(d.getDate())}`;
  const time = `${twoDigits(d.getHours())}:${twoDigits(d.getMinutes())}:${twoDigits(d.getSeconds())}`;
  return `${date} ${time}`;
}

// Body to EDIT an item: the whole original item + the changed fields
function buildItemUpdateBody(originalItem, changedFields, image) {
  // Turn the new values into what the platform expects (flags 1/0, numbers...)
  const sendFields = {};
  for (const [field, value] of Object.entries(changedFields)) {
    if (field === "days") {
      Object.assign(sendFields, expandDays(value)); // "days" becomes sun..sat (menu-helpers.js)
    } else {
      sendFields[field] = toSendValue(field, value);
    }
  }

  const merged = { ...originalItem, ...sendFields, updated_at: nowText() };
  const formData = new FormData();

  for (const [key, value] of Object.entries(merged)) {
    const isNull = value === null || value === undefined;
    if (SKIP_IF_NULL.includes(key) && isNull) continue;
    formData.append(key, toFormValue(key, value));
  }
  if (image) formData.set("image", image.blob, image.name);
  return formData;
}

// Body to CREATE an item
function buildItemCreateBody(groupId, storeId, item, order, image) {
  const fields = {
    cost: "0", custom_tag: "", custom_tag2: "", custom_tag3: "",
    description: item.description ?? "", fri: "true",
    from_price: item.from_price == null || item.from_price === 0 ? "" : String(item.from_price),
    has_promotion: "0", id: "",
    image: "null", image_2: "null", image_3: "null", image_4: "null", image_5: "null",
    internal_id: item.internal_id ?? "", is_alcohol: String(toSendValue("is_alcohol", item.is_alcohol)),
    is_best_seller: String(toSendValue("is_best_seller", item.is_best_seller)), is_delivery: "true",
    is_highlight: String(toSendValue("is_highlight", item.is_highlight)),
    is_invisible: String(toSendValue("is_invisible", item.is_invisible)), is_newest: String(toSendValue("is_newest", item.is_newest)),
    is_table: "true",
    menu_group_id: String(groupId), minimum_quantity: String(item.minimum_quantity ?? 0), mon: "true",
    name: item.name ?? "", obs_placeholder: "", order: String(order),
    points: "0", price1: String(item.price1 ?? 0),
    price2: item.price2 == null ? "" : String(item.price2),
    printer_group_id: "", requires_schedule: "0", sat: "true",
    stock_item_id_1: "null", stock_item_id_2: "null", stock_item_id_3: "null", stock_item_id_4: "null",
    store_id: String(storeId),
    strike_price: isBlank(item.strike_price) || Number(item.strike_price) === 0 ? "" : String(item.strike_price),
    sun: "true", thu: "true", tue: "true",
    type: "1", variations: "", variationsSize: "0", wed: "true",
  };

  // The days of the week: the default is "all days" (the 7 fields above are "true").
  // If the AI sent "days", we overwrite them.
  if ("days" in item && normalizeDays(item.days)) Object.assign(fields, expandDays(item.days));

  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  if (image) formData.set("image", image.blob, image.name);
  return formData;
}

// The editor's text for ONE option inside the "complements[]" list
function optionToEditorJson(option, slot) {
  return toText({
    id: option.id ?? slot, // a new option gets a small fake id (like the editor does)
    name: option.name,
    description: option.description ?? null,
    is_invisible: option.is_invisible ? 1 : 0,
    image: option.image ?? null,
    price: Number(option.price ?? 0),
    cost: option.cost ?? 0,
    order: option.order ?? 0,
    stock_control: option.stock_control ?? 0,
    max_quantity: option.max_quantity ?? 0,
    stock: option.stock ?? 0,
    custom_tag1: option.custom_tag1 ?? "",
    custom_tag2: option.custom_tag2 ?? "",
    custom_tag3: option.custom_tag3 ?? "",
    internal_id: option.internal_id ?? "",
    updated_at: option.updated_at ?? null,
    stock_item_checkbox: false,
    stock_item_id: option.stock_item_id ?? null,
    file: null,
  });
}

// Body to ADD options to an EXISTING complement group.
// The editor sends the group (with its real id) and the WHOLE list of options:
// the existing ones (real ids) first, then the new ones (fake ids).
function buildAddOptionsBody(group, existingOptions, newOptions) {
  const formData = new FormData();
  const all = [...existingOptions, ...newOptions.map((o) => ({ ...o, id: null }))];

  formData.append("id", String(group.id));
  formData.append("store_id", String(group.store_id));
  formData.append("name", group.name);
  formData.append("description", String(group.description ?? "null"));
  formData.append("max", String(group.max));
  formData.append("min", String(group.min));
  formData.append("order", String(group.order));
  formData.append("created_at", String(group.created_at ?? ""));
  formData.append("updated_at", String(group.updated_at ?? ""));
  formData.append("deleted_at", "null");
  formData.append("is_pizza", String(group.is_pizza ? 1 : 0));
  formData.append("only_one", String(group.only_one ? 1 : 0));

  all.forEach((option, index) => {
    formData.append("complements[]", optionToEditorJson(option, index + 1000)); // fake id: never equals a real one
    formData.append(`complements-images[${index}]`, "null");
  });
  return formData;
}

// Body of "edit a complement group": the WHOLE original record, with the
// changed fields on top. (The platform expects the full record, as its editor sends.)
// "skipOptionIds": options that no longer exist (they must not be in the list).
function buildCompGroupUpdateBody(originalComp, fields, skipOptionIds = []) {
  const body = { ...originalComp, ...fields };
  if (skipOptionIds.length > 0) {
    body.complements = (originalComp.complements || []).filter((o) => !skipOptionIds.includes(o.id));
  }
  if ("only_one" in fields) body.only_one = fields.only_one ? 1 : 0;
  return body;
}

// Body of "edit an option": the WHOLE original option, with the changed fields on top.
// The platform's editor sends the price as TEXT ("1"), so we do the same.
function buildOptionUpdateBody(originalOption, fields) {
  const body = { ...originalOption, ...fields };
  body.price = String(body.price);
  if ("is_invisible" in fields) body.is_invisible = fields.is_invisible ? 1 : 0;
  return body;
}


// Puts a group's banner in the request.
//
// Confirmed by capturing the platform's own editor: when you pick a banner,
// the editor does NOT upload a file. It sends the picture LINK, as plain text,
// in BOTH fields "image" and "file". The server downloads it and stores its own copy.
// That is the default mode "bank-url". The other modes are only for experiments:
//   "bank-url"  -> link as text in "image" AND in "file"   (what the editor does)
//   "image-url" -> link as text in "image" only
//   "file"      -> uploads the file in the field "file"
//   "image"     -> uploads the file in the field "image"
function attachGroupImage(formData, image) {
  const mode = opts.groupBannerMode;
  if (mode === "bank-url") {
    formData.set("image", image.sourceUrl);
    formData.set("file", image.sourceUrl);
  } else if (mode === "image-url") {
    formData.set("image", image.sourceUrl);
  } else {
    formData.set(mode, image.blob, image.name);
  }
}

// Body to EDIT a group
function buildGroupUpdateBody(originalGroup, changedFields, image) {
  const merged = { ...originalGroup, ...changedFields, updated_at: nowText() };
  const formData = new FormData();

  for (const [key, value] of Object.entries(merged)) {
    // The items are not group fields, so we skip them
    if (key === "itens" || key === "itens_all") continue;

    if (value === null || value === undefined) {
      formData.append(key, key === "image" ? "" : "null");
    } else {
      formData.append(key, String(value));
    }
  }
  // The banner file goes in the field chosen in Options ("file" or "image").
  // The editor's own request always has an empty "file".
  formData.set("file", "");
  if (image) attachGroupImage(formData, image);
  return formData;
}

// Body to CREATE a group
function buildGroupCreateBody(storeId, group, order, image) {
  const fields = {
    // display_group_title: "1" = the "show group title" flag is ON for every new group
    always_display: "0", display_group_title: "1", end_time: "null", file: "",
    flavor1: "0", flavor2: "0", fri: "true", id: "", image: "",
    is_invisible: group.is_invisible ? "true" : "false", is_pizza: "0", itens_hidden: "0",
    mon: "true", name: group.name ?? "", only_one: "0", order: String(order),
    sat: "true", size: "null", size1: "null", size2: "null", start_time: "null",
    store_id: String(storeId), sun: "true", thu: "true", tue: "true", wed: "true",
  };

  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  if (image) attachGroupImage(formData, image);
  return formData;
}

// Body to CREATE a complement group
function buildComplementBody(storeId, comp) {
  const options = (comp.complements || []).filter((o) => o && o.name);
  // The editor always sends at least 5 slots, even empty ones
  const slots = Math.max(5, options.length);
  const formData = new FormData();

  for (let i = 0; i < slots; i++) {
    formData.append(`complements-images[${i}]`, "null");
  }
  for (let i = 0; i < slots; i++) {
    const option = options[i]; // undefined if the slot is empty
    formData.append("complements[]", toText({
      id: i,
      name: option ? option.name : "",
      price: option ? String(option.price ?? 0) : 0,
      cost: "", image: null, order: i, is_invisible: 0,
      stock_control: 0, stock: 0, max_quantity: 0,
      custom_tag1: "", custom_tag2: "", custom_tag3: "", internal_id: "",
      updated_at: null, stock_item_checkbox: false, stock_item_id: null, file: null,
    }));
  }

  formData.append("description", comp.description ?? "");
  formData.append("id", "null");
  formData.append("is_pizza", "false");
  formData.append("max", String(comp.max ?? options.length));
  formData.append("min", String(comp.min ?? 0));
  formData.append("name", comp.name);
  formData.append("only_one", comp.only_one ? "true" : "false");
  formData.append("order", String(comp.order ?? 1));
  formData.append("store_id", String(storeId));
  return formData;
}

async function downloadBackup(storeId, original, originalComps) {
  const storeName = await getStoreName(storeId); // can be null if it is not known yet
  const backup = {
    storeId: storeId,
    storeName: storeName,
    savedAt: new Date().toISOString(),
    menu: original,
    complement_groups: originalComps,
  };
  downloadFile(buildBackupFileName(storeName, storeId, new Date()), toText(backup));
}


// =====================================================================
// 12. APPLY
// =====================================================================

// Sorts the list of changes into "boxes" by type,
// so that we can apply them in the right order.
function sortChangesIntoBuckets(changes) {
  const buckets = {
    groupUpdates: new Map(),  // group id -> { field: newValue }
    itemUpdates: new Map(),   // item id  -> { field: newValue }
    imageRefs: new Map(),     // item id  -> the item object that has the image
    groupImageRefs: new Map(),// group id -> the group object that has the banner
    compGroupUpdates: new Map(), // complement group id -> { field: newValue }
    optionUpdates: new Map(),    // option id -> { field: newValue }
    optionCreates: new Map(),    // complement group id -> [new option objects]
    optionDeletes: [],           // option-delete changes
    compDeletes: [],             // comp-delete changes (whole complement groups)
    unlinks: [],                 // unlink changes (complement group <-> item)
    groupCreates: [],
    itemCreates: [],
    complementCreates: [],
    links: [],
    deletes: [],
  };

  for (const change of changes) {
    switch (change.type) {
      case "group-create": buckets.groupCreates.push(change); break;
      case "create": buckets.itemCreates.push(change); break;
      case "delete": buckets.deletes.push(change); break;
      case "comp-create": buckets.complementCreates.push(change); break;
      case "link": buckets.links.push(change); break;
      case "image": buckets.imageRefs.set(change.id, change.itemRef); break;
      case "group-image": buckets.groupImageRefs.set(change.id, change.groupRef); break;

      case "option-create":
        if (!buckets.optionCreates.has(change.groupId)) buckets.optionCreates.set(change.groupId, []);
        buckets.optionCreates.get(change.groupId).push(change.option);
        break;
      case "option-delete": buckets.optionDeletes.push(change); break;
      case "comp-delete": buckets.compDeletes.push(change); break;
      case "unlink": buckets.unlinks.push(change); break;

      case "comp-update":
        if (!buckets.compGroupUpdates.has(change.id)) buckets.compGroupUpdates.set(change.id, {});
        buckets.compGroupUpdates.get(change.id)[change.field] = change.to;
        break;

      case "option-update":
        if (!buckets.optionUpdates.has(change.id)) buckets.optionUpdates.set(change.id, {});
        buckets.optionUpdates.get(change.id)[change.field] = change.to;
        break;

      case "group-update":
        if (!buckets.groupUpdates.has(change.id)) buckets.groupUpdates.set(change.id, {});
        buckets.groupUpdates.get(change.id)[change.field] = change.to;
        break;

      default: // "update" (item field)
        if (!buckets.itemUpdates.has(change.id)) buckets.itemUpdates.set(change.id, {});
        buckets.itemUpdates.get(change.id)[change.field] = change.to;
    }
  }
  return buckets;
}

// The text lines shown in dry run mode (what WOULD be sent)
function buildPlanLines(buckets) {
  const lines = [];

  const groupIds = new Set([...buckets.groupUpdates.keys(), ...buckets.groupImageRefs.keys()]);
  for (const id of groupIds) {
    const fieldNames = Object.keys(buckets.groupUpdates.get(id) || {});
    if (buckets.groupImageRefs.has(id)) fieldNames.push("image + file (link do banner)");
    lines.push(`POST /stores/group/${id}   campos: ${fieldNames.join(", ")}`);
  }

  const itemIds = new Set([...buckets.itemUpdates.keys(), ...buckets.imageRefs.keys()]);
  for (const id of itemIds) {
    const fieldNames = Object.keys(buckets.itemUpdates.get(id) || {});
    if (buckets.imageRefs.has(id)) fieldNames.push("image (arquivo)");
    lines.push(`POST /stores/item/${id}   campos: ${fieldNames.join(", ")}`);
  }

  for (const [id, fields] of buckets.compGroupUpdates) {
    lines.push(`PUT /stores/group-complements/by-id/${id}   campos: ${Object.keys(fields).join(", ")}`);
  }
  for (const [id, fields] of buckets.optionUpdates) {
    lines.push(`PUT /stores/complement/by-id/${id}   campos: ${Object.keys(fields).join(", ")}`);
  }
  for (const [groupId, newOptions] of buckets.optionCreates) {
    lines.push(`POST /stores/complement-group/store   grupo ${groupId}: ${newOptions.length} opção(ões) nova(s)`);
  }
  for (const change of buckets.optionDeletes) {
    lines.push(`DELETE /stores/complement/${change.id}   "${change.label}"`);
  }
  for (const change of buckets.unlinks) {
    lines.push(`DELETE /stores/group-complements/link/${change.compId}/${change.itemId}   ${change.label}`);
  }
  for (const change of buckets.compDeletes) {
    lines.push(`DELETE /stores/group-complements/by-id/${change.id}   "${change.label}"`);
  }

  for (const change of buckets.groupCreates) {
    const bannerText = images.has(change.group) ? " + banner" : "";
    lines.push(`POST /stores/group   "${change.group.name}"${bannerText}`);
    for (const item of change.group.itens || []) {
      if (item._delete) continue;
      const imageText = images.has(item) ? " + imagem" : "";
      lines.push(`POST /stores/item   "${item.name}" (no grupo novo)${imageText}`);
      if ((item.complement_group_ids || []).length > 0) {
        lines.push(`POST /stores/group-complements/link   para o novo item "${item.name}"`);
      }
    }
  }

  for (const change of buckets.itemCreates) {
    const imageText = images.has(change.item) ? " + imagem" : "";
    lines.push(`POST /stores/item   "${change.item.name}" (grupo ${change.groupId})${imageText}`);
    if ((change.item.complement_group_ids || []).length > 0) {
      lines.push(`POST /stores/group-complements/link   para o novo item "${change.item.name}"`);
    }
  }

  for (const change of buckets.complementCreates) {
    lines.push(`POST /stores/complement-group/store   "${change.comp.name}"`);
  }
  for (const change of buckets.links) {
    const compText = change.ref.kind === "existing" ? change.ref.id : `"${change.ref.name}"`;
    lines.push(`POST /stores/group-complements/link   item ${change.itemId} ← ${compText}`);
  }
  for (const change of buckets.deletes) {
    lines.push(`DELETE /stores/item/${change.id}   "${change.label}"`);
  }
  return lines;
}

// The changes that are ticked (checked) in the review list
function selectedChanges() {
  return pending.filter((change) => change.on);
}

// ---------- progress bar ----------
// The total is only an ESTIMATE (some things are discovered while working).
// If we do more steps than estimated, the total grows, so the bar never breaks.
let progressDone = 0;
let progressTotal = 0;

function drawProgress() {
  $("#progressBar").max = Math.max(1, progressTotal);
  $("#progressBar").value = progressDone;
  $("#progressText").textContent = `Enviando ${progressDone} de ${progressTotal}`;
}

function startProgress(total) {
  progressDone = 0;
  progressTotal = total;
  $("#progressWrap").hidden = false;
  drawProgress();
}

// Call this after each request that worked
function tickProgress() {
  progressDone++;
  if (progressDone > progressTotal) progressTotal = progressDone;
  drawProgress();
}

// ---------- the box shown when everything is finished ----------
function showApplySummary(ok, title, lines) {
  const box = $("#applySummary");
  box.hidden = false;
  box.className = "applysummary" + (ok ? "" : " bad");
  box.innerHTML = "";
  box.append(createElement("strong", "", title));
  for (const line of lines) box.append(createElement("div", "", line));
}

// ---------- the history of applies (saved in chrome.storage.local) ----------
async function saveHistoryEntry(entry, lastApply) {
  const saved = await chrome.storage.local.get("applyHistory");
  const history = saved.applyHistory || [];

  // Only the LAST apply can be undone, so older entries lose the "undo" mark
  for (const old of history) old.canUndo = false;

  history.unshift(entry);
  await chrome.storage.local.set({
    applyHistory: history.slice(0, 30), // keep the last 30
    lastApply: lastApply, // null when there is nothing to undo
  });
}

// Draws the History tab
async function renderHistory() {
  const saved = await chrome.storage.local.get(["applyHistory", "lastApply"]);
  const history = saved.applyHistory || [];

  const box = $("#historyList");
  box.innerHTML = "";
  if (history.length === 0) {
    box.append(createElement("div", "muted", "Nada aplicado ainda."));
  }

  for (const entry of history) {
    const row = createElement("div", "histrow");
    const kindText = entry.kind === "undo" ? "Desfazer · " : entry.kind === "wipe" ? "LIMPEZA DA LOJA · " : "";
    const storeText = entry.storeName ? `${entry.storeName} (${entry.storeId})` : `loja ${entry.storeId}`;

    let stateText = "OK";
    let stateClass = "ok";
    if (entry.undone) { stateText = "desfeito"; stateClass = "undone"; }
    else if (!entry.ok) { stateText = entry.partial ? "parou no meio" : "erro"; stateClass = "bad"; }

    const what = createElement("div", "what");
    what.append(createElement("div", "", `${kindText}${storeText}`));
    what.append(createElement("div", "muted", describeCounts(entry.counts)));
    if (entry.error) what.append(createElement("div", "errt", entry.error.slice(0, 160)));

    row.append(
      createElement("span", "when", new Date(entry.at).toLocaleString()),
      what,
      createElement("span", `state ${stateClass}`, stateText)
    );
    box.append(row);
  }

  // The undo card
  const last = saved.lastApply;
  const undoButton = $("#btnUndo");
  if (last) {
    const parts = [];
    const editedTotal = last.editedItems.length + last.editedGroups.length + (last.editedCompGroups || []).length + (last.editedOptions || []).length;
    if (editedTotal > 0) {
      parts.push(`voltar ${editedTotal} registro(s) editado(s)`);
    }
    if (last.createdItemIds.length > 0) parts.push(`apagar ${last.createdItemIds.length} item(ns) criado(s)`);
    const optionsToUndo = (last.createdOptionIds || []).length + (last.deletedOptions || []).length + (last.unlinked || []).length + (last.createdCompIds || []).length;
    if (optionsToUndo > 0) parts.push(`desfazer ${optionsToUndo} opção(ões) de complemento`);
    const storeText = last.storeName ? `${last.storeName} (${last.storeId})` : `loja ${last.storeId}`;
    $("#undoInfo").textContent = `Última aplicação: ${new Date(last.at).toLocaleString()} em ${storeText}. Desfazer vai ${parts.join(" e ")}.`;
    undoButton.disabled = false;
  } else {
    $("#undoInfo").textContent = "Nenhuma aplicação para desfazer.";
    undoButton.disabled = true;
  }
}

$("#btnClearHistory").onclick = async () => {
  if (!confirm("Limpar o histórico? (Isso também tira a possibilidade de desfazer.)")) return;
  await chrome.storage.local.remove(["applyHistory", "lastApply"]);
  renderHistory();
};

// Cuts the items off a group record (the update body does not need them)
function groupWithoutItems(group) {
  const copy = { ...group };
  delete copy.itens;
  delete copy.itens_all;
  return copy;
}

// ---------- the APPLY button ----------
async function applyChanges() {
  const button = $("#btnApply");

  // Get the copy saved at export time
  const saved = await chrome.storage.local.get(["original", "originalComps", "storeId"]);
  const original = saved.original;
  const originalComps = saved.originalComps;
  const storeId = saved.storeId;
  if (!original || !originalComps || !storeId) {
    return toast("Faça a exportação primeiro.", "err");
  }

  // Only the changes that are ticked
  const chosen = selectedChanges();
  if (chosen.length === 0) return toast("Nenhuma mudança está marcada.", "err");
  const buckets = sortChangesIntoBuckets(chosen);

  // The log box shown under the Apply button
  const logBox = $("#applyLog");
  logBox.hidden = false;
  logBox.innerHTML = "";
  $("#applySummary").hidden = true;
  $("#progressWrap").hidden = true;
  function log(text, cssClass = "") {
    logBox.append(createElement("div", cssClass, text));
    logBox.scrollTop = logBox.scrollHeight;
  }

  // A link to a NEW complement group only makes sense if that group is ticked too
  const newComplementNames = new Set(buckets.complementCreates.map((c) => c.comp.name));
  buckets.links = buckets.links.filter((link) => {
    if (link.ref.kind === "new" && !newComplementNames.has(link.ref.name)) {
      log(`Ligação ignorada: o grupo de complementos novo "${link.ref.name}" não está marcado.`);
      return false;
    }
    return true;
  });

  // ----- Simulation: only list what would be sent -----
  // It happens when "Somente simulação" is on, or on the FIRST click
  // when "Simular antes de aplicar" is on. The second click sends for real.
  const simulateNow = opts.dryRun || (opts.simulateFirst && !simulatedOnce);
  if (simulateNow) {
    log("SIMULAÇÃO: nada foi enviado. Estas são as requisições que seriam feitas:");
    for (const line of buildPlanLines(buckets)) log(line);
    if (!opts.dryRun) {
      simulatedOnce = true;
      log("");
      log('Se estiver tudo certo, clique em "Agora aplicar de verdade".');
      updateApplyButtonText();
    }
    return;
  }

  // ----- Safety checks (the user can cancel at any of them) -----
  const storeName = await getStoreName(storeId);
  const storeLabel = storeName ? `${storeName} (ID ${storeId})` : `ID ${storeId}`;

  // 1. Is the editor tab showing ANOTHER store?
  const liveStoreId = (await chrome.storage.session.get("storeId")).storeId;
  if (liveStoreId && String(liveStoreId) !== String(storeId)) {
    const liveName = await getStoreName(liveStoreId);
    const liveLabel = liveName ? `${liveName} (ID ${liveStoreId})` : `ID ${liveStoreId}`;
    const ok = confirm(
      `ATENÇÃO: a aba do editor está na loja ${liveLabel}, mas esta exportação é da loja ${storeLabel}.\n\nAplicar na loja ${storeLabel} mesmo assim?`
    );
    if (!ok) { logBox.hidden = true; return; }
  }

  // 2. The normal confirmation
  if (opts.confirmApply) {
    let itemCount = 0;
    for (const group of original) itemCount += group.itens_all.length;
    const ok = confirm(
      `LOJA: ${storeLabel}\n(${original.length} grupos, ${itemCount} itens)\n\nAplicar ${chosen.length} mudança(s)?`
    );
    if (!ok) { logBox.hidden = true; return; }
  }

  // 3. A very big apply: ask again
  if (chosen.length > opts.maxChanges) {
    const ok = confirm(`Isto são ${chosen.length} mudanças de uma vez (o limite de aviso é ${opts.maxChanges}).\n\nTem certeza?`);
    if (!ok) { logBox.hidden = true; return; }
  }

  // 4. Type the store name (if the option is on)
  if (opts.typeStoreName) {
    const expected = storeName || String(storeId);
    const typed = prompt(`Para confirmar, digite o nome da loja:\n\n${expected}`);
    if (typed === null || typed.trim().toLowerCase() !== expected.trim().toLowerCase()) {
      toast("O nome não confere. Nada foi enviado.", "err");
      logBox.hidden = true;
      return;
    }
  }

  // 5. Deletes
  const unlinkLines = buckets.unlinks.map((u) => ({ id: u.itemId, label: `desligar ${u.label}` }));
  const deleteList = [...buckets.deletes, ...buckets.optionDeletes, ...buckets.compDeletes, ...unlinkLines];
  if (deleteList.length > 0) {
    const names = deleteList.map((d) => `- ${d.label} (${d.id})`).join("\n");
    if (opts.typeToDelete) {
      const typed = prompt(`Isto vai APAGAR ${deleteList.length} item(ns)/opção(ões)/grupo(s)/ligação(ões) da loja ${storeLabel}:\n\n${names}\n\nPara continuar, digite APAGAR:`);
      if (typed === null || typed.trim().toUpperCase() !== "APAGAR") {
        toast("Exclusão cancelada. Nada foi enviado.", "err");
        logBox.hidden = true;
        return;
      }
    } else {
      const ok = confirm(`Isto vai APAGAR ${deleteList.length} item(ns)/opção(ões)/grupo(s)/ligação(ões):\n\n${names}\n\nContinuar?`);
      if (!ok) { logBox.hidden = true; return; }
    }
  }

  button.disabled = true;
  simulatedOnce = false; // the next apply (after a new preview) simulates again
  startProgress(estimateSteps(buckets));

  // ----- Backup -----
  if (isDefaultStore(original, originalComps)) {
    // The store still has the default menu given at creation: nothing to protect
    log("Loja com o cardápio padrão (Promoções / Item teste): backup dispensado.");
  } else if (opts.autoBackup) {
    await downloadBackup(storeId, original, originalComps);
    log("Backup baixado para a sua pasta Downloads.");
    await sleep(800);
  } else {
    log("O backup está desligado nas Opções.");
  }

  // Quick lookups by id
  const allItems = new Map();
  for (const group of original) {
    for (const item of group.itens_all) allItems.set(item.id, item);
  }
  const originalGroups = new Map(original.map((g) => [g.id, g]));

  // What we did (for the summary and the history) and what we need to undo it
  const done = { edits: 0, newItems: 0, newGroups: 0, newComplements: 0, newOptions: 0, links: 0, images: 0, banners: 0, deletes: 0 };
  const undo = { editedItems: [], editedGroups: [], createdItemIds: [], createdGroupIds: [], createdCompIds: [], editedCompGroups: [], editedOptions: [], createdOptionIds: [], deletedOptions: [], unlinked: [] };
  let errorMessage = "";

  // ----- Send everything, step by step -----
  // If any step fails, the "catch" at the bottom stops everything.
  try {
    // STEP 1: edit groups (fields and/or banner image)
    const groupIdsToSave = new Set([...buckets.groupUpdates.keys(), ...buckets.groupImageRefs.keys()]);
    for (const id of groupIdsToSave) {
      const originalGroup = originalGroups.get(id);
      const fields = buckets.groupUpdates.get(id) || {};
      const image = buckets.groupImageRefs.has(id) ? images.get(buckets.groupImageRefs.get(id)) : null;

      await api("POST", `/stores/group/${id}`, {
        body: buildGroupUpdateBody(originalGroup, fields, image),
        label: `editar grupo ${id}`,
      });

      undo.editedGroups.push(groupWithoutItems(originalGroup)); // remember how it was
      done.edits++;
      if (image) done.banners++;
      const doneFields = Object.keys(fields);
      if (image) doneFields.push(`banner (modo "${opts.groupBannerMode}")`);
      log(`OK  grupo ${id} "${originalGroup.name}": ${doneFields.join(", ")}`, "ok");
      tickProgress();
    }

    // STEP 2: edit items (fields and/or image)
    const itemIdsToSave = new Set([...buckets.itemUpdates.keys(), ...buckets.imageRefs.keys()]);
    for (const id of itemIdsToSave) {
      const originalItem = allItems.get(id);
      const fields = buckets.itemUpdates.get(id) || {};
      const image = buckets.imageRefs.has(id) ? images.get(buckets.imageRefs.get(id)) : null;

      await api("POST", `/stores/item/${id}`, {
        body: buildItemUpdateBody(originalItem, fields, image),
        label: `editar item ${id}`,
      });

      undo.editedItems.push(originalItem); // remember how it was
      done.edits++;
      if (image) done.images++;
      const doneFields = Object.keys(fields);
      if (image) doneFields.push("image");
      log(`OK  item ${id} "${originalItem.name}": ${doneFields.join(", ")}`, "ok");
      tickProgress();
    }

    // STEP 2b: edit complement groups, THEN their options.
    // The group request carries the old list of options, so it must go first:
    // this way it cannot overwrite an option that we edit right after.
    const compGroupsById = new Map(originalComps.map((c) => [c.id, c]));
    const optionsById = new Map();
    for (const comp of originalComps) {
      for (const option of comp.complements || []) optionsById.set(option.id, option);
    }

    for (const [id, fields] of buckets.compGroupUpdates) {
      const originalComp = compGroupsById.get(id);
      await api("PUT", `/stores/group-complements/by-id/${id}`, {
        json: buildCompGroupUpdateBody(originalComp, fields),
        label: `editar grupo de complementos ${id}`,
      });
      undo.editedCompGroups.push(originalComp); // remember how it was
      done.edits++;
      log(`OK  grupo de complementos ${id} "${originalComp.name}": ${Object.keys(fields).join(", ")}`, "ok");
      tickProgress();
    }

    for (const [id, fields] of buckets.optionUpdates) {
      const originalOption = optionsById.get(id);
      await api("PUT", `/stores/complement/by-id/${id}`, {
        json: buildOptionUpdateBody(originalOption, fields),
        label: `editar opção ${id}`,
      });
      undo.editedOptions.push(originalOption);
      done.edits++;
      log(`OK  opção ${id} "${originalOption.name}": ${Object.keys(fields).join(", ")}`, "ok");
      tickProgress();
    }

    // STEP 3: create new groups
    // The platform does not tell us the new id, so we fetch the menu again
    // and look for the groups that were not there before.
    if (buckets.groupCreates.length > 0) {
      const biggestOrder = Math.max(0, ...original.map((g) => g.order || 0));

      for (const [index, change] of buckets.groupCreates.entries()) {
        const order = change.group.order ?? biggestOrder + index + 1;
        const bannerImage = images.get(change.group) || null;
        await api("POST", "/stores/group", {
          body: buildGroupCreateBody(storeId, change.group, order, bannerImage),
          label: "criar grupo",
        });
        done.newGroups++;
        if (bannerImage) done.banners++;
        log(`OK  grupo criado "${change.group.name}"${bannerImage ? " (com banner)" : ""}`, "ok");
        tickProgress();
      }

      const freshMenu = await fetchMenu(storeId);
      const knownGroupIds = new Set(original.map((g) => g.id));
      const createdGroups = freshMenu
        .filter((g) => !knownGroupIds.has(g.id))
        .sort((a, b) => a.id - b.id);

      // Match each group we created with its new id, using the name
      const usedIds = new Set();
      for (const change of buckets.groupCreates) {
        const match = createdGroups.find(
          (g) => g.name === change.group.name && !usedIds.has(g.id)
        );
        if (!match) {
          throw new Error(`O grupo "${change.group.name}" foi criado, mas não consegui achar o id dele.`);
        }
        usedIds.add(match.id);

        // Now the items of this new group can be created too
        const itemsOfNewGroup = (change.group.itens || []).filter((it) => !it._delete);
        itemsOfNewGroup.forEach((item, i) => {
          buckets.itemCreates.push({
            type: "create",
            groupId: match.id,
            label: item.name,
            item: item,
            fallbackOrder: i + 1,
          });
        });
      }
    }

    // STEP 4: create new items
    const nextOrderByGroup = new Map();
    for (const change of buckets.itemCreates) {
      // Work out the next free "order" number in this group
      if (!nextOrderByGroup.has(change.groupId)) {
        const group = originalGroups.get(change.groupId);
        const biggest = group ? Math.max(0, ...group.itens_all.map((i) => i.order || 0)) : 0;
        nextOrderByGroup.set(change.groupId, biggest + 1);
      }
      const order = change.item.order ?? change.fallbackOrder ?? nextOrderByGroup.get(change.groupId);
      nextOrderByGroup.set(change.groupId, nextOrderByGroup.get(change.groupId) + 1);

      const image = images.get(change.item) || null;
      await api("POST", "/stores/item", {
        body: buildItemCreateBody(change.groupId, storeId, change.item, order, image),
        label: "criar item",
      });
      done.newItems++;
      if (image) done.images++;
      log(`OK  item criado "${change.item.name}" no grupo ${change.groupId}${image ? " (com imagem)" : ""}`, "ok");
      tickProgress();
    }

    // STEP 5: create new complement groups (and find their new ids)
    const complementIdByName = new Map();
    if (buckets.complementCreates.length > 0) {
      const knownIds = new Set(originalComps.map((c) => c.id));

      for (const change of buckets.complementCreates) {
        await api("POST", "/stores/complement-group/store", {
          body: buildComplementBody(storeId, change.comp),
          label: "criar grupo de complementos",
        });
        done.newComplements++;
        log(`OK  grupo de complementos criado "${change.comp.name}"`, "ok");
        tickProgress();
      }

      const freshComps = await fetchComplements(storeId);
      const createdComps = freshComps
        .filter((c) => !knownIds.has(c.id))
        .sort((a, b) => a.id - b.id);
      for (const comp of createdComps) complementIdByName.set(comp.name, comp.id);

      for (const change of buckets.complementCreates) {
        if (!complementIdByName.has(change.comp.name)) {
          throw new Error(`O grupo de complementos "${change.comp.name}" foi criado, mas não consegui achar o id dele.`);
        }
      }
    }

    // STEP 6: link complement groups to items
    const resolveReference = makeComplementResolver(originalComps, newComplementNames);

    // Links for items that already existed
    const linkJobs = buckets.links.map((c) => ({
      itemId: c.itemId, groupId: c.groupId, label: c.label, ref: c.ref,
    }));

    // Links for items we just created (we need to find their new ids first)
    const createdWithLinks = buckets.itemCreates.filter(
      (c) => (c.item.complement_group_ids || []).length > 0
    );
    if (createdWithLinks.length > 0) {
      const freshMenu = await fetchMenu(storeId);
      const usedItemIds = new Set();

      for (const change of createdWithLinks) {
        const group = freshMenu.find((g) => g.id === change.groupId);
        const match = group && group.itens_all.find(
          (i) => !allItems.has(i.id) && !usedItemIds.has(i.id) && i.name === change.item.name
        );
        if (!match) {
          throw new Error(`O item "${change.item.name}" foi criado, mas não consegui achar o id dele para ligar os complementos.`);
        }
        usedItemIds.add(match.id);

        for (const reference of change.item.complement_group_ids) {
          const resolved = resolveReference(reference);
          if (resolved) {
            linkJobs.push({ itemId: match.id, groupId: change.groupId, label: change.item.name, ref: resolved });
          }
        }
      }
    }

    // Send the links (skipping duplicates)
    const alreadyLinked = new Set();
    for (const job of linkJobs) {
      const complementId = job.ref.kind === "existing"
        ? job.ref.id
        : complementIdByName.get(job.ref.name);

      const key = `${job.itemId}:${complementId}`;
      if (alreadyLinked.has(key)) continue;
      alreadyLinked.add(key);

      await api("POST", "/stores/group-complements/link", {
        json: {
          complement_group_id: complementId,
          group_id: job.groupId,
          link_all: false,
          menu_item_id: job.itemId,
          store_id: String(storeId),
        },
        label: "ligar complemento",
      });
      done.links++;
      log(`OK  complemento ${complementId} ligado ao item ${job.itemId} "${job.label}"`, "ok");
      tickProgress();
    }

    // STEP 6b: add new options to EXISTING complement groups.
    // We send the group with ALL its options (existing ones with their latest values),
    // like the platform's editor does. It runs after the edits above.
    for (const [groupId, newOptions] of buckets.optionCreates) {
      const originalComp = compGroupsById.get(groupId);
      const group = { ...originalComp, ...(buckets.compGroupUpdates.get(groupId) || {}) };
      const existing = (originalComp.complements || []).map((o) => ({ ...o, ...(buckets.optionUpdates.get(o.id) || {}) }));
      await api("POST", "/stores/complement-group/store", {
        body: buildAddOptionsBody(group, existing, newOptions),
        label: `adicionar opções ao grupo ${groupId}`,
      });
      done.newOptions += newOptions.length;
      log(`OK  grupo de complementos ${groupId} "${originalComp.name}": ${newOptions.length} opção(ões) nova(s): ${newOptions.map((o) => o.name).join(", ")}`, "ok");
      tickProgress();
    }

    // STEP 7: deletes (always last, it is the most dangerous)
    for (const change of buckets.optionDeletes) {
      await api("DELETE", `/stores/complement/${change.id}`, { label: "apagar opção" });
      undo.deletedOptions.push({ ...optionsById.get(change.id), complement_group_id: change.groupId });
      done.deletes++;
      log(`OK  opção apagada ${change.id} "${change.label}"`, "ok");
      tickProgress();
    }
    for (const change of buckets.unlinks) {
      await api("DELETE", `/stores/group-complements/link/${change.compId}/${change.itemId}`, { label: "desligar complemento" });
      undo.unlinked.push({ compId: change.compId, itemId: change.itemId, groupId: change.groupId });
      done.deletes++;
      log(`OK  complemento ${change.compId} desligado do item ${change.itemId}`, "ok");
      tickProgress();
    }
    for (const change of buckets.compDeletes) {
      await api("DELETE", `/stores/group-complements/by-id/${change.id}`, { label: "apagar grupo de complementos" });
      done.deletes++;
      log(`OK  grupo de complementos apagado ${change.id} "${change.label}"`, "ok");
      tickProgress();
    }
    for (const change of buckets.deletes) {
      await api("DELETE", `/stores/item/${change.id}`, { label: "apagar item" });
      done.deletes++;
      log(`OK  item apagado ${change.id} "${change.label}"`, "ok");
      tickProgress();
    }
  } catch (error) {
    errorMessage = error.message;
    log("");
    log(`ERRO: ${error.message}`, "bad");
    log("Parou. Nada depois deste ponto foi enviado.", "bad");
    log("Para continuar: clique em Exportar e depois em Ver mudanças. Só o que faltou vai aparecer.", "bad");
    toast("Aplicar parou por causa de um erro. Veja o registro.", "err");
  }

  // ----- The end (it runs with success AND with error) -----
  // 1. Fetch the menu again: it becomes the new "original" for the next preview,
  //    and it shows us the ids of what was created (needed to undo).
  try {
    const [freshMenu, freshComps] = await Promise.all([
      fetchMenu(storeId),
      fetchComplements(storeId),
    ]);
    const oldItemIds = original.flatMap((g) => g.itens_all.map((i) => i.id));
    undo.createdItemIds = findNewIds(freshMenu.flatMap((g) => g.itens_all), oldItemIds);
    undo.createdGroupIds = findNewIds(freshMenu, original.map((g) => g.id));
    undo.createdCompIds = findNewIds(freshComps, originalComps.map((c) => c.id));
    // New options inside groups that already existed (to be able to undo them)
    const oldOptionIds = originalComps.flatMap((c) => (c.complements || []).map((o) => o.id));
    const knownGroupIds = new Set(originalComps.map((c) => c.id));
    undo.createdOptionIds = findNewIds(
      freshComps.filter((c) => knownGroupIds.has(c.id)).flatMap((c) => c.complements || []),
      oldOptionIds
    );

    await chrome.storage.local.set({
      original: freshMenu,
      originalComps: freshComps,
      exportedAt: Date.now(),
    });
    $("#exportBox").value = buildExportText(freshMenu, freshComps);
    await updateExportInfo();
  } catch (error) {
    log("Não consegui atualizar a cópia do menu. Clique em Exportar de novo.");
  }

  // 2. Save in the history (and what is needed to undo)
  const canUndo = undo.editedItems.length + undo.editedGroups.length + undo.editedCompGroups.length + undo.editedOptions.length + undo.createdOptionIds.length + undo.deletedOptions.length + undo.unlinked.length + undo.createdCompIds.length + undo.createdItemIds.length > 0;
  const entry = buildHistoryEntry({
    storeId: storeId,
    storeName: storeName,
    ok: errorMessage === "",
    error: errorMessage,
    counts: done,
    canUndo: canUndo,
    partial: errorMessage !== "" && describeCounts(done) !== "nada",
  });
  const lastApply = canUndo
    ? { entryId: entry.id, at: entry.at, storeId: String(storeId), storeName: storeName || "", ...undo }
    : null;
  await saveHistoryEntry(entry, lastApply);

  // 3. Show the summary
  const summaryLines = [
    `Loja: ${storeLabel}`,
    `Feito: ${describeCounts(done)}`,
  ];
  if (undo.createdGroupIds.length > 0) summaryLines.push(`Grupos novos criados: ${undo.createdGroupIds.length}`);
  if (errorMessage) summaryLines.push(`Erro: ${errorMessage}`);
  if (canUndo) summaryLines.push("Dá para desfazer na aba Histórico.");

  if (errorMessage) {
    showApplySummary(false, "Parou por causa de um erro", summaryLines);
  } else {
    drawProgress();
    log("");
    log("Pronto. A caixa de exportação agora mostra o menu atualizado.", "ok");
    toast("Aplicado");
    showApplySummary(true, "Aplicado com sucesso", summaryLines);
  }

  pending = [];
  $("#changes").innerHTML = "";
  $("#thumbs").innerHTML = "";
  $("#selectInfo").textContent = "";
  button.disabled = true;
  updateApplyButtonText();
}
$("#btnApply").onclick = applyChanges;


// =====================================================================
// 12b. UNDO the last apply
// What we can do: put the edited fields back, and delete the items we created.
// What we CANNOT do (the platform gives us no way): delete groups,
// delete complement groups, unlink complements, bring back deleted items.
// =====================================================================
async function undoLastApply() {
  const saved = await chrome.storage.local.get("lastApply");
  const last = saved.lastApply;
  if (!last) return toast("Não há nada para desfazer.", "err");

  const storeLabel = last.storeName ? `${last.storeName} (ID ${last.storeId})` : `ID ${last.storeId}`;
  const editedCount = last.editedItems.length + last.editedGroups.length + (last.editedCompGroups || []).length + (last.editedOptions || []).length;

  // Say clearly what will, and what will not, be undone
  let message = `DESFAZER a última aplicação na loja ${storeLabel}?\n\n`;
  message += `- Voltar ${editedCount} registro(s) editado(s) ao valor de antes\n`;
  message += `- Apagar ${last.createdItemIds.length} item(ns) criado(s)\n`;
  if ((last.createdOptionIds || []).length > 0) message += `- Apagar ${last.createdOptionIds.length} opção(ões) de complemento criada(s)\n`;
  if ((last.unlinked || []).length > 0) message += `- Ligar de novo ${last.unlinked.length} complemento(s) desligado(s)\n`;
  if ((last.deletedOptions || []).length > 0) message += `- Recriar ${last.deletedOptions.length} opção(ões) de complemento apagada(s) (com novo id)\n`;
  if (last.createdGroupIds.length > 0) {
    message += `\nNÃO dá para apagar os ${last.createdGroupIds.length} grupo(s) criado(s): apague à mão no editor.\n`;
  }
  if (last.createdCompIds.length > 0) {
    message += `- Apagar ${last.createdCompIds.length} grupo(s) de complementos criado(s)\n`;
  }
  message += "\nSe alguém editou esses itens depois, a edição será sobrescrita.";

  const liveStoreId = (await chrome.storage.session.get("storeId")).storeId;
  if (liveStoreId && String(liveStoreId) !== String(last.storeId)) {
    message += `\n\nATENÇÃO: a aba do editor está em outra loja (ID ${liveStoreId}).`;
  }
  if (!confirm(message)) return;

  const logBox = $("#undoLog");
  logBox.hidden = false;
  logBox.innerHTML = "";
  function log(text, cssClass = "") {
    logBox.append(createElement("div", cssClass, text));
    logBox.scrollTop = logBox.scrollHeight;
  }

  const button = $("#btnUndo");
  button.disabled = true;
  const done = { edits: 0, newItems: 0, newGroups: 0, newComplements: 0, newOptions: 0, links: 0, images: 0, banners: 0, deletes: 0 };
  let errorMessage = "";

  try {
    // 1. Put the edited groups back
    while (last.editedGroups.length > 0) {
      const group = last.editedGroups[0];
      await api("POST", `/stores/group/${group.id}`, {
        body: buildGroupUpdateBody(group, {}, null),
        label: `desfazer grupo ${group.id}`,
      });
      last.editedGroups.shift(); // done: take it off the list
      done.edits++;
      log(`OK  grupo ${group.id} "${group.name}" voltou ao que era`, "ok");
    }

    // 1b. Put the edited complement groups and options back (group first, then options)
    last.editedCompGroups = last.editedCompGroups || [];
    last.editedOptions = last.editedOptions || [];
    last.deletedOptions = last.deletedOptions || [];
    while (last.editedCompGroups.length > 0) {
      const comp = last.editedCompGroups[0];
      await api("PUT", `/stores/group-complements/by-id/${comp.id}`, {
        json: buildCompGroupUpdateBody(comp, {}, last.deletedOptions.map((o) => o.id)),
        label: `desfazer grupo de complementos ${comp.id}`,
      });
      last.editedCompGroups.shift();
      done.edits++;
      log(`OK  grupo de complementos ${comp.id} "${comp.name}" voltou ao que era`, "ok");
    }
    while (last.editedOptions.length > 0) {
      const option = last.editedOptions[0];
      await api("PUT", `/stores/complement/by-id/${option.id}`, {
        json: buildOptionUpdateBody(option, {}),
        label: `desfazer opção ${option.id}`,
      });
      last.editedOptions.shift();
      done.edits++;
      log(`OK  opção ${option.id} "${option.name}" voltou ao que era`, "ok");
    }

    // 2. Put the edited items back
    while (last.editedItems.length > 0) {
      const item = last.editedItems[0];
      await api("POST", `/stores/item/${item.id}`, {
        body: buildItemUpdateBody(item, {}, null),
        label: `desfazer item ${item.id}`,
      });
      last.editedItems.shift();
      done.edits++;
      log(`OK  item ${item.id} "${item.name}" voltou ao que era`, "ok");
    }

    // 2b. Delete the options that were created, then re-create the ones that were deleted
    last.createdOptionIds = last.createdOptionIds || [];
    last.deletedOptions = last.deletedOptions || [];
    while (last.createdOptionIds.length > 0) {
      const id = last.createdOptionIds[0];
      await api("DELETE", `/stores/complement/${id}`, { label: "desfazer: apagar opção criada" });
      last.createdOptionIds.shift();
      done.deletes++;
      log(`OK  opção criada ${id} apagada`, "ok");
    }
    if (last.deletedOptions.length > 0) {
      // Fresh groups: we need their CURRENT options to send the whole list
      const freshGroups = await fetchComplements(last.storeId);
      while (last.deletedOptions.length > 0) {
        const groupId = last.deletedOptions[0].complement_group_id;
        const group = freshGroups.find((c) => c.id === groupId);
        if (!group) throw new Error(`O grupo de complementos ${groupId} não existe mais: não dá para recriar as opções apagadas.`);
        const restore = last.deletedOptions.filter((o) => o.complement_group_id === groupId);
        await api("POST", "/stores/complement-group/store", {
          body: buildAddOptionsBody(group, group.complements || [], restore),
          label: `desfazer: recriar opções do grupo ${groupId}`,
        });
        last.deletedOptions = last.deletedOptions.filter((o) => o.complement_group_id !== groupId);
        done.newOptions += restore.length;
        log(`OK  ${restore.length} opção(ões) recriada(s) no grupo ${groupId}: ${restore.map((o) => o.name).join(", ")}`, "ok");
      }
    }

    // 2c. Link again the complements that were unlinked
    last.unlinked = last.unlinked || [];
    while (last.unlinked.length > 0) {
      const link = last.unlinked[0];
      await api("POST", "/stores/group-complements/link", {
        json: {
          complement_group_id: link.compId,
          group_id: link.groupId,
          link_all: false,
          menu_item_id: link.itemId,
          store_id: String(last.storeId),
        },
        label: "desfazer: ligar complemento",
      });
      last.unlinked.shift();
      done.links++;
      log(`OK  complemento ${link.compId} ligado de novo ao item ${link.itemId}`, "ok");
    }

    // 2d. Delete the complement groups that were created
    while (last.createdCompIds.length > 0) {
      const id = last.createdCompIds[0];
      await api("DELETE", `/stores/group-complements/by-id/${id}`, { label: "desfazer: apagar grupo de complementos criado" });
      last.createdCompIds.shift();
      done.deletes++;
      log(`OK  grupo de complementos criado ${id} apagado`, "ok");
    }

    // 3. Delete the items that were created
    while (last.createdItemIds.length > 0) {
      const id = last.createdItemIds[0];
      await api("DELETE", `/stores/item/${id}`, { label: "desfazer: apagar item criado" });
      last.createdItemIds.shift();
      done.deletes++;
      log(`OK  item criado ${id} apagado`, "ok");
    }
  } catch (error) {
    errorMessage = error.message;
    log(`ERRO: ${error.message}`, "bad");
    log("Parou. O que já foi desfeito continua desfeito. Você pode tentar de novo.", "bad");
  }

  // Refresh our copy of the menu
  try {
    const [freshMenu, freshComps] = await Promise.all([fetchMenu(last.storeId), fetchComplements(last.storeId)]);
    const savedStore = await chrome.storage.local.get("storeId");
    if (String(savedStore.storeId) === String(last.storeId)) {
      await chrome.storage.local.set({ original: freshMenu, originalComps: freshComps, exportedAt: Date.now() });
      $("#exportBox").value = buildExportText(freshMenu, freshComps);
      await updateExportInfo();
    }
  } catch (error) {
    log("Não consegui atualizar a cópia do menu. Clique em Exportar de novo.");
  }

  // Update the history
  const history = (await chrome.storage.local.get("applyHistory")).applyHistory || [];
  const originalEntry = history.find((e) => e.id === last.entryId);
  const stillLeft = last.editedGroups.length + last.editedCompGroups.length + last.editedOptions.length + last.editedItems.length + last.createdItemIds.length + last.createdOptionIds.length + last.deletedOptions.length + last.unlinked.length + last.createdCompIds.length;

  if (originalEntry && stillLeft === 0) originalEntry.undone = true;
  const undoEntry = buildHistoryEntry({
    storeId: last.storeId,
    storeName: last.storeName,
    ok: errorMessage === "",
    error: errorMessage,
    counts: done,
    canUndo: false,
    partial: errorMessage !== "",
  });
  undoEntry.kind = "undo";
  history.unshift(undoEntry);
  await chrome.storage.local.set({
    applyHistory: history.slice(0, 30),
    // If everything was undone there is nothing left; if it stopped, keep what is left
    lastApply: stillLeft === 0 ? null : last,
  });

  if (errorMessage) {
    toast("Desfazer parou por causa de um erro.", "err");
  } else {
    log("");
    log("Pronto. Confira no editor da plataforma.", "ok");
    toast("Desfeito");
  }
  renderHistory();
}
$("#btnUndo").onclick = undoLastApply;


// =====================================================================
// 13. ADVANCED TAB (in the code it is still called "dev")
// =====================================================================

// The "Status" card and the two pills at the top
async function showStatus() {
  const session = await chrome.storage.session.get(["token", "tokenAt", "storeId"]);
  const local = await chrome.storage.local.get(["original", "originalComps", "storeId", "exportedAt", "imageBank", "imageBankAt", "groupImageBank"]);

  // --- Token pill ---
  const tokenPill = $("#pillToken");
  tokenPill.textContent = session.token ? `Token ok · ${timeAgo(session.tokenAt)}` : "Sem token";
  tokenPill.className = "pill " + (session.token ? "ok" : "err");
  tokenPill.title = session.token
    ? "Capturado da aba do editor. Nunca é exibido nem salvo em disco."
    : "Abra o editor de menu em outra aba e recarregue (F5).";

  // --- Store pill ---
  const storePill = $("#pillStore");
  storePill.textContent = session.storeId ? `Loja ${session.storeId}` : "Sem loja";
  storePill.className = "pill " + (session.storeId ? "" : "warn");

  // --- The big store bar under the header ---
  renderStoreBar(session.storeId, local.storeId);

  // --- Status table ---
  const allItems = local.original ? local.original.flatMap((g) => g.itens_all) : [];
  const itemsWithImage = allItems.filter((i) => i.image).length;

  let mode = "exclusões desligadas";
  if (opts.dryRun) mode = "SIMULAÇÃO (não envia nada)";
  else if (opts.allowDeletes) mode = "exclusões permitidas";

  const menuCopyText = local.original
    ? `${local.original.length} grupos · ${allItems.length} itens · ${itemsWithImage} com imagem · ${(local.originalComps || []).length} grupos de complementos`
    : "nenhuma";

  const rows = [
    ["Token", session.token ? `capturado ${timeAgo(session.tokenAt)} (nunca exibido)` : "ainda não capturado"],
    ["Loja na aba do editor", session.storeId || "nenhuma ainda"],
    ["Última exportação", local.exportedAt ? `${formatTime(local.exportedAt)} · loja ${local.storeId}` : "nunca"],
    ["Cópia do menu", menuCopyText],
    ["Banco de imagens", local.imageBank
      ? `${local.imageBank.images.length} produtos · ${local.groupImageBank ? local.groupImageBank.images.length : 0} banners · atualizado ${timeAgo(local.imageBankAt)}`
      : "ainda não baixado"],
    ["Modo", mode],
  ];

  const grid = $("#statusGrid");
  grid.innerHTML = "";
  for (const [name, value] of rows) {
    grid.append(createElement("dt", "", name), createElement("dd", "", value));
  }
}

// The request log (newest first)
function showRequestLog() {
  const box = $("#reqLog");
  box.innerHTML = "";

  if (requestLog.length === 0) {
    box.append(createElement("div", "muted", "Nenhuma requisição ainda."));
    return;
  }

  const newestFirst = [...requestLog].reverse();
  for (const entry of newestFirst) {
    const row = createElement("div", "logrow" + (entry.error ? " bad" : ""));
    const pathText = entry.path + (entry.label ? `  (${entry.label})` : "");
    row.append(
      createElement("span", "", formatTime(entry.t)),
      createElement("span", "", entry.method),
      createElement("span", "", pathText),
      createElement("span", "", String(entry.status ?? "ERR")),
      createElement("span", "", entry.ms !== undefined ? `${entry.ms} ms` : "")
    );
    box.append(row);
    if (entry.error) box.append(createElement("div", "logerr", entry.error));
  }
}

// The list of requests captured from the platform's own editor
async function showCaptured() {
  const saved = await chrome.storage.session.get("captured");
  const captured = saved.captured || [];

  const box = $("#capturedList");
  box.innerHTML = "";

  if (captured.length === 0) {
    box.append(createElement("div", "muted", "Nada capturado ainda. Salve algo no editor da plataforma e clique em Atualizar."));
    return;
  }

  for (const item of [...captured].reverse()) {
    const details = createElement("details");
    const typeText = item.contentType ? " · " + item.contentType.split(";")[0] : "";
    details.append(
      createElement("summary", "", `${item.method} ${item.url.replace(API, "")}${typeText}`),
      createElement("pre", "code-block", toPrettyText(item.body))
    );
    box.append(details);
  }
}

function showDevTab() {
  showStatus();
  showRequestLog();
  showCaptured();
}

$("#btnTest").onclick = async () => {
  const session = await chrome.storage.session.get("storeId");
  const local = await chrome.storage.local.get("storeId");
  const storeId = session.storeId || local.storeId;
  if (!storeId) return toast("Ainda sem ID da loja. Recarregue a aba do editor.", "err");

  const startTime = performance.now();
  try {
    await fetchMenu(storeId);
    const ms = Math.round(performance.now() - startTime);
    toast(`Conexão OK · loja ${storeId} · ${ms} ms`);
  } catch (error) {
    toast(error.message, "err");
  }
};

$("#btnCopyLog").onclick = () => {
  const lines = requestLog.map((e) => {
    const errorText = e.error ? " | " + e.error : "";
    return `${formatTime(e.t)} ${e.method} ${e.path} ${e.status ?? "ERR"} ${e.ms ?? ""}${errorText}`;
  });
  copyText(lines.join("\n"));
};

$("#btnClearLog").onclick = () => {
  requestLog = [];
  chrome.storage.session.set({ reqLog: requestLog });
  showRequestLog();
};

$("#btnRefreshCaptured").onclick = showCaptured;

$("#btnCopyCaptured").onclick = async () => {
  const saved = await chrome.storage.session.get("captured");
  copyText(toPrettyText(saved.captured || []));
};

$("#btnClearCaptured").onclick = async () => {
  await chrome.storage.session.set({ captured: [] });
  showCaptured();
};

$("#btnRaw").onclick = async () => {
  const saved = await chrome.storage.local.get(["original", "originalComps", "storeId"]);
  if (!saved.original) return toast("Nada salvo ainda. Exporte primeiro.", "err");
  downloadFile(
    `raw-store-${saved.storeId}.json`,
    toPrettyText({ menu: saved.original, complement_groups: saved.originalComps })
  );
};

$("#btnClearStore").onclick = async () => {
  await chrome.storage.local.remove(["original", "originalComps", "exportedAt"]);
  await updateExportInfo();
  showStatus();
  toast("Cópia salva do menu apagada. Exporte de novo antes de importar.");
};

$("#btnRefreshBank").onclick = async () => {
  const button = $("#btnRefreshBank");
  setBusy(button, true, "Baixando...");
  try {
    const products = await downloadBank("items");
    const banners = await downloadBank("groups");
    toast(`Banco atualizado: ${products.images.length} produtos e ${banners.images.length} banners`);
    showStatus();
  } catch (error) {
    toast(error.message, "err");
  } finally {
    setBusy(button, false);
  }
};

$("#btnResetOpts").onclick = async () => {
  if (!confirm("Restaurar todas as opções para o padrão?")) return;
  opts = { ...DEFAULTS };
  await chrome.storage.local.set({ options: opts });
  applyTheme();
  showOptionsOnScreen();
  toast("Opções restauradas");
};


// =====================================================================
// 13b. WIPE THE WHOLE STORE (danger zone, Advanced tab)
// Deletes the items, then the groups, then the complement groups.
// The ORDER matters: a group is only deleted after its items are gone,
// and complement groups last (nothing is linked to them anymore).
// =====================================================================

// The addresses used to delete things.
//   item:            known. The platform's own editor uses it.
//   group:           NOT VERIFIED (we have no capture of it yet).
//   complementGroup: known (confirmed by a capture).
// If the platform uses another address, change ONLY these lines.
const WIPE_ENDPOINTS = {
  item: (id) => `/stores/item/${id}`,
  group: (id) => `/stores/group/${id}`,
  complementGroup: (id) => `/stores/group-complements/by-id/${id}`, // confirmed by a capture
};

// Deleting groups needs the items to be deleted too: keep the boxes consistent
$("#wipeGroups").onchange = () => {
  if ($("#wipeGroups").checked) $("#wipeItems").checked = true;
};
$("#wipeItems").onchange = () => {
  if (!$("#wipeItems").checked) $("#wipeGroups").checked = false;
};

async function wipeStore() {
  const button = $("#btnWipe");
  const logBox = $("#wipeLog");
  function log(text, cssClass = "") {
    logBox.hidden = false;
    logBox.append(createElement("div", cssClass, text));
    logBox.scrollTop = logBox.scrollHeight;
  }
  logBox.innerHTML = "";

  const wantItems = $("#wipeItems").checked;
  const wantGroups = $("#wipeGroups").checked;
  const wantComps = $("#wipeComps").checked;
  if (!wantItems && !wantGroups && !wantComps) return toast("Marque o que deve ser apagado.", "err");

  // Always the store that is OPEN in the editor tab right now
  const storeId = (await chrome.storage.session.get("storeId")).storeId;
  if (!storeId) return toast("Abra o editor de menu da loja e recarregue (F5).", "err");
  const storeName = await getStoreName(storeId);
  const storeLabel = storeName ? `${storeName} (ID ${storeId})` : `ID ${storeId}`;

  // Read the store as it is RIGHT NOW (not the old saved copy)
  setBusy(button, true, "Lendo a loja...");
  let menu, comps;
  try {
    [menu, comps] = await Promise.all([fetchMenu(storeId), fetchComplements(storeId)]);
  } catch (error) {
    setBusy(button, false);
    return toast(error.message, "err");
  }
  setBusy(button, false);

  const itemList = menu.flatMap((g) => g.itens_all.map((i) => ({ id: i.id, name: i.name })));
  const todo = {
    items: wantItems ? itemList : [],
    groups: wantGroups ? menu.map((g) => ({ id: g.id, name: g.name })) : [],
    comps: wantComps ? comps.map((c) => ({ id: c.id, name: c.name })) : [],
  };
  const total = todo.items.length + todo.groups.length + todo.comps.length;
  if (total === 0) return toast("Não há nada para apagar com essas opções.", "ok");

  const summaryText =
    `${todo.items.length} item(ns), ${todo.groups.length} grupo(s) e ${todo.comps.length} grupo(s) de complementos`;

  // ----- Safety 1: a clear question -----
  if (!confirm(`LIMPAR A LOJA ${storeLabel}\n\nIsto vai APAGAR: ${summaryText}.\n\nNão tem como desfazer. Um backup será baixado antes.\n\nContinuar?`)) return;

  // ----- Safety 2: type the store name -----
  const expected = storeName || String(storeId);
  const typedName = prompt(`Para confirmar, digite o nome da loja que será LIMPA:\n\n${expected}`);
  if (typedName === null || typedName.trim().toLowerCase() !== expected.trim().toLowerCase()) {
    return toast("O nome não confere. Nada foi apagado.", "err");
  }

  // ----- Safety 3: type the phrase -----
  const typedPhrase = prompt("Última confirmação. Digite LIMPAR TUDO:");
  if (typedPhrase === null || typedPhrase.trim().toUpperCase() !== "LIMPAR TUDO") {
    return toast("Cancelado. Nada foi apagado.", "err");
  }

  // "Somente simulação" is on: only list
  if (opts.dryRun) {
    log("SIMULAÇÃO: nada foi apagado. Seria apagado:");
    for (const i of todo.items) log(`DELETE ${WIPE_ENDPOINTS.item(i.id)}  (${i.name})`);
    for (const g of todo.groups) log(`DELETE ${WIPE_ENDPOINTS.group(g.id)}  (${g.name})`);
    for (const c of todo.comps) log(`DELETE ${WIPE_ENDPOINTS.complementGroup(c.id)}  (${c.name})`);
    return;
  }

  // The backup is ALWAYS made here, whatever the option says
  // (except for a store that still has the default menu: nothing to protect)
  if (isDefaultStore(menu, comps)) {
    log("Loja com o cardápio padrão (Promoções / Item teste): backup dispensado.");
  } else {
    await downloadBackup(storeId, menu, comps);
    log("Backup baixado para a sua pasta Downloads.");
    await sleep(800);
  }

  button.disabled = true;
  const done = { deletes: 0, deletedGroups: 0, deletedComplements: 0 };
  let finished = 0;
  let errorMessage = "";

  // One delete. "what" tells which kind of thing it is, for the messages.
  async function deleteOne(path, label, what) {
    try {
      await api("DELETE", path, { label: `limpar loja: ${what}` });
    } catch (error) {
      // 404 / 405 on groups or complement groups: the address is probably different
      if (what !== "item" && /^(404|405)/.test(error.message)) {
        throw new Error(
          `${error.message}\nA plataforma não aceitou apagar ${what === "grupo" ? "grupos" : "grupos de complementos"} por este endereço (${path}). ` +
          `Apague um deles no editor da plataforma, vá em Avançado > Capturas do editor, copie a captura e mande para quem mantém a ferramenta.`
        );
      }
      throw error;
    }
    finished++;
    $("#btnWipe").textContent = `Apagando ${finished} de ${total}`;
    log(`OK  ${what} apagado: ${label}`, "ok");
  }

  try {
    for (const item of todo.items) { await deleteOne(WIPE_ENDPOINTS.item(item.id), `${item.name} (${item.id})`, "item"); done.deletes++; }
    for (const group of todo.groups) { await deleteOne(WIPE_ENDPOINTS.group(group.id), `${group.name} (${group.id})`, "grupo"); done.deletedGroups++; }
    for (const comp of todo.comps) { await deleteOne(WIPE_ENDPOINTS.complementGroup(comp.id), `${comp.name} (${comp.id})`, "grupo de complementos"); done.deletedComplements++; }
  } catch (error) {
    errorMessage = error.message;
    log("");
    log(`ERRO: ${error.message}`, "bad");
    log("Parou. O que já foi apagado continua apagado (o backup tem tudo).", "bad");
    toast("A limpeza parou por causa de um erro.", "err");
  }

  // Refresh our saved copy (if it is the same store), so the next Export/Preview is right
  try {
    const [freshMenu, freshComps] = await Promise.all([fetchMenu(storeId), fetchComplements(storeId)]);
    const savedStore = await chrome.storage.local.get("storeId");
    if (String(savedStore.storeId) === String(storeId)) {
      await chrome.storage.local.set({ original: freshMenu, originalComps: freshComps, exportedAt: Date.now() });
      $("#exportBox").value = buildExportText(freshMenu, freshComps);
      await updateExportInfo();
    }
  } catch (error) {
    log("Não consegui reler a loja. Clique em Exportar de novo.");
  }

  // History (nothing to undo here, so lastApply becomes empty)
  const entry = buildHistoryEntry({
    storeId: storeId, storeName: storeName, ok: errorMessage === "", error: errorMessage.split("\n")[0],
    counts: done, canUndo: false, partial: errorMessage !== "" && finished > 0,
  });
  entry.kind = "wipe";
  await saveHistoryEntry(entry, null);

  if (!errorMessage) {
    log("");
    log(`Pronto. A loja ${storeLabel} foi limpa.`, "ok");
    toast("Loja limpa");
  }
  button.disabled = false;
  button.textContent = "Limpar a loja…";
}
$("#btnWipe").onclick = wipeStore;


// =====================================================================
// 14. SUPPORT: the "Como usar" guide and the diagnostic report
// =====================================================================

// Shows or hides the first-time guide
function showHowto() {
  $("#howto").hidden = Boolean(opts.helpDismissed);
}

$("#btnHideHowto").onclick = () => {
  opts.helpDismissed = true;
  chrome.storage.local.set({ options: opts });
  showHowto();
};

$("#btnShowHowto").onclick = () => {
  opts.helpDismissed = false;
  chrome.storage.local.set({ options: opts });
  showHowto();
  showTab("json");
};

// Builds the report and copies it. It NEVER includes the token.
$("#btnDiagnostic").onclick = async () => {
  const session = await chrome.storage.session.get(["token", "tokenAt", "storeId"]);
  const local = await chrome.storage.local.get(["original", "originalComps", "storeId", "applyHistory"]);

  const allItems = local.original ? local.original.flatMap((g) => g.itens_all) : [];
  const menuSummary = local.original
    ? `${local.original.length} grupos, ${allItems.length} itens, ${(local.originalComps || []).length} grupos de complementos`
    : "";

  let mode = "normal";
  if (opts.dryRun) mode = "somente simulação";
  else if (opts.advancedMode) mode = "avançado";

  const history = local.applyHistory || [];
  const report = buildDiagnosticReport({ // from menu-helpers.js
    version: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    hasToken: Boolean(session.token), // only yes/no, never the token itself
    tokenAge: session.tokenAt ? timeAgo(session.tokenAt) : "",
    liveStoreId: session.storeId,
    exportedStoreId: local.storeId,
    storeName: await getStoreName(local.storeId),
    menuSummary: menuSummary,
    mode: mode,
    options: opts,
    lastApply: history[0] || null,
    requests: requestLog,
  });
  copyText(report);
};


// =====================================================================
// 15. START
// This runs once, when the side panel opens.
// =====================================================================
async function init() {
  await loadOptions();

  // The version number comes from manifest.json
  const version = chrome.runtime.getManifest().version;
  $("#versionText").textContent = version;
  $("#footerVersion").textContent = version;

  showHowto();

  // The text of "Meu pedido" that was typed before
  const savedDraft = await chrome.storage.local.get("requestDraft");
  $("#requestBox").value = savedDraft.requestDraft || "";

  const savedLog = await chrome.storage.session.get("reqLog");
  requestLog = savedLog.reqLog || [];

  await showStatus();
  await updateExportInfo();
  showTab(location.hash.slice(1)); // opens the tab named in the address (#json, #history...)

  // Refresh the status pills every 30 seconds, and whenever storage changes
  setInterval(showStatus, 30000);
  chrome.storage.onChanged.addListener(() => showStatus());
}
init();
