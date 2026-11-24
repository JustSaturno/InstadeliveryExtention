"use strict";

// =====================================================================
// menu-helpers.js
//
// Small helper functions used by app.js.
//
// This file has NO Chrome code and does NOT touch the page. It only has
// plain functions that receive data and return data. That makes them
// easy to read and easy to test (we test them with Node, outside Chrome).
//
// What is inside:
//   1. The list of item fields we are allowed to edit
//   2. Small converters (is it empty? is it "yes"?)
//   3. The weekday switches ("days")
//   4. Comparing and checking values
//   5. The +18 safety net (looks at the NAME of the item)
//   6. Counting changes, estimating the steps, building the history
//   7. Texts: AI message, diagnostic report, store name
// =====================================================================


// =====================================================================
// 1. THE ITEM FIELDS WE CAN EDIT
// Each field has:
//   name:     the name of the field in the JSON
//   label:    the name shown on the screen (Portuguese)
//   kind:     how to compare it ("text", "number", "money", "flag", "days")
//   nullable: can it be empty (null)?
// =====================================================================

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// The names of the days, in Portuguese, for the screen
const WEEKDAY_LABELS = {
  sun: "dom", mon: "seg", tue: "ter", wed: "qua", thu: "qui", fri: "sex", sat: "sáb",
};

const ITEM_FIELD_LIST = [
  { name: "name",             label: "nome",               kind: "text",   nullable: false },
  { name: "description",      label: "descrição",          kind: "text",   nullable: true },
  { name: "price1",           label: "preço",              kind: "number", nullable: false, min: 0 },
  { name: "price2",           label: "preço 2",            kind: "number", nullable: true,  min: 0 },
  { name: "from_price",       label: "a partir de",        kind: "money",  nullable: true,  min: 0 },
  { name: "strike_price",     label: "preço riscado",      kind: "money",  nullable: true,  min: 0 },
  { name: "order",            label: "ordem",              kind: "number", nullable: false, integer: true },
  { name: "is_invisible",     label: "oculto",             kind: "flag",   nullable: false },
  { name: "is_alcohol",       label: "bebida +18",         kind: "flag",   nullable: false },
  { name: "is_highlight",     label: "destaque",           kind: "flag",   nullable: false },
  { name: "is_best_seller",   label: "mais vendido",       kind: "flag",   nullable: false },
  { name: "is_newest",        label: "novidade",           kind: "flag",   nullable: false },
  { name: "internal_id",      label: "código interno",     kind: "text",   nullable: true },
  { name: "minimum_quantity", label: "quantidade mínima",  kind: "number", nullable: false, min: 0, integer: true },
  { name: "days",             label: "dias disponíveis",   kind: "days",   nullable: false },
];

// Just the names: ["name", "description", "price1", ...]
const ITEM_FIELDS = ITEM_FIELD_LIST.map((field) => field.name);

// A lookup by name: ITEM_FIELD_SPEC["price1"] -> { name, label, kind... }
const ITEM_FIELD_SPEC = {};
for (const field of ITEM_FIELD_LIST) ITEM_FIELD_SPEC[field.name] = field;

// The name shown on the screen for a field
function fieldLabel(fieldName) {
  const spec = ITEM_FIELD_SPEC[fieldName];
  return spec ? spec.label : fieldName;
}


// =====================================================================
// 2. SMALL CONVERTERS
// =====================================================================

// Is this value "empty"? (null, undefined or empty text)
function isBlank(value) {
  return value === null || value === undefined || value === "";
}

// Turns many ways of saying "yes" into true. Everything else is false.
//   true, 1, "1", "true"  -> true
//   false, 0, "0", "false", null -> false
function toFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}


// =====================================================================
// 3. THE WEEKDAY SWITCHES
// On the platform an item has 7 fields: sun, mon, tue, wed, thu, fri, sat.
// For the AI we show ONE field called "days":
//   "all"                  -> available every day
//   ["mon", "tue", "fri"]  -> available only on these days
// =====================================================================

// Is the day ON? A missing value counts as ON (the platform default).
function dayIsOn(value) {
  if (value === undefined || value === null) return true;
  return toFlag(value);
}

// The "days" value of an item, as the AI sees it: "all" or a list
function getDaysValue(item) {
  const onDays = WEEKDAYS.filter((day) => dayIsOn(item[day]));
  return onDays.length === WEEKDAYS.length ? "all" : onDays;
}

// Turns "all" / ["mon","tue"] / "mon" into a clean list in week order.
// Returns null when something is not understood (like ["xyz"]).
function normalizeDays(value) {
  if (value === "all") return [...WEEKDAYS];
  if (typeof value === "string") value = [value];
  if (!Array.isArray(value) || value.length === 0) return null;

  const list = value.map((day) => String(day).toLowerCase().trim());
  for (const day of list) {
    if (!WEEKDAYS.includes(day)) return null;
  }
  return WEEKDAYS.filter((day) => list.includes(day)); // in week order
}

// Turns the "days" value into the 7 fields the platform wants:
//   ["mon"] -> { sun: "false", mon: "true", tue: "false", ... }
function expandDays(value) {
  const onDays = normalizeDays(value) || [...WEEKDAYS];
  const result = {};
  for (const day of WEEKDAYS) result[day] = onDays.includes(day) ? "true" : "false";
  return result;
}


// =====================================================================
// 4. COMPARING AND CHECKING VALUES
// =====================================================================

// The value of a field, read from an item.
// Almost always it is item[field]. Only "days" is built from 7 fields.
function getFieldValue(item, fieldName) {
  if (fieldName === "days") return getDaysValue(item);
  return item[fieldName];
}

// Did this field really change?  (true = different)
// We compare by KIND, so that harmless differences are not counted:
//   - 6 and "6" are the same price
//   - 0 and false are the same flag
//   - null and "" are the same empty text
function valuesDiffer(fieldName, newValue, oldValue) {
  const spec = ITEM_FIELD_SPEC[fieldName];
  if (!spec) return newValue !== oldValue; // unknown field: strict compare

  switch (spec.kind) {
    case "flag":
      return toFlag(newValue) !== toFlag(oldValue);

    case "days": {
      const a = normalizeDays(newValue);
      const b = normalizeDays(oldValue);
      if (!a || !b) return true;
      return a.join(",") !== b.join(",");
    }

    case "money": {
      // null, "" and 0 all mean "no value"; 20 and "20" are the same
      const clean = (v) => (isBlank(v) || Number(v) === 0 ? null : Number(v));
      return clean(newValue) !== clean(oldValue);
    }

    case "number": {
      if (isBlank(newValue) && isBlank(oldValue)) return false;
      if (isBlank(newValue) || isBlank(oldValue)) return true;
      const a = Number(newValue);
      const b = Number(oldValue);
      if (Number.isNaN(a) || Number.isNaN(b)) return newValue !== oldValue;
      return a !== b;
    }

    default: {
      // "text": null and "" are the same
      const clean = (v) => (isBlank(v) ? "" : String(v));
      return clean(newValue) !== clean(oldValue);
    }
  }
}

// Checks a value BEFORE we send it. Returns an error text, or null if it is fine.
// Example: checkFieldValue("price1", "abc") -> "preço precisa ser um número"
function checkFieldValue(fieldName, value) {
  const spec = ITEM_FIELD_SPEC[fieldName];
  if (!spec) return null;

  // Empty values
  if (isBlank(value) && spec.kind !== "text") {
    return spec.nullable ? null : `${spec.label} não pode ficar vazio`;
  }

  switch (spec.kind) {
    case "text":
      if (!spec.nullable && String(value ?? "").trim() === "") return `${spec.label} não pode ficar vazio`;
      if (typeof value !== "string" && !isBlank(value)) return `${spec.label} precisa ser um texto`;
      return null;

    case "number":
    case "money": {
      const number = Number(value);
      if (typeof value === "boolean" || Number.isNaN(number) || !Number.isFinite(number)) {
        return `${spec.label} precisa ser um número (use ponto nos decimais, ex.: 18.5)`;
      }
      if (spec.min !== undefined && number < spec.min) return `${spec.label} não pode ser negativo`;
      if (spec.integer && !Number.isInteger(number)) return `${spec.label} precisa ser um número inteiro`;
      return null;
    }

    case "flag":
      if ([true, false, 0, 1, "0", "1", "true", "false"].includes(value)) return null;
      return `${spec.label} precisa ser 0 ou 1`;

    case "days":
      return normalizeDays(value)
        ? null
        : `${spec.label} precisa ser "all" ou uma lista como ["mon","tue"] (sun, mon, tue, wed, thu, fri, sat)`;

    default:
      return null;
  }
}

// Turns the value into what we SEND to the platform
//   flags: always 1 or 0     numbers: a real number     empty: null
function toSendValue(fieldName, value) {
  const spec = ITEM_FIELD_SPEC[fieldName];
  if (!spec) return value;
  if (spec.kind === "flag") return toFlag(value) ? 1 : 0;
  if (spec.kind === "number" || spec.kind === "money") return isBlank(value) ? null : Number(value);
  return value;
}

// A value written for people to read, used in the list of changes
//   describeValue("is_alcohol", 1)        -> "sim"
//   describeValue("days", ["mon","tue"])  -> "seg, ter"
function describeValue(fieldName, value) {
  const spec = ITEM_FIELD_SPEC[fieldName];
  if (spec && spec.kind === "flag") return toFlag(value) ? "sim" : "não";
  if (spec && spec.kind === "days") {
    const list = normalizeDays(value);
    if (!list) return JSON.stringify(value);
    return list.length === WEEKDAYS.length ? "todos os dias" : list.map((d) => WEEKDAY_LABELS[d]).join(", ");
  }
  if (isBlank(value)) return "vazio";
  return JSON.stringify(value);
}


// =====================================================================
// 5. THE +18 SAFETY NET
// The AI should set "is_alcohol": 1 on alcoholic items (the prompt says so).
// This is a second check, made by the extension: it looks at the NAME of the
// item and warns when the name looks alcoholic but the flag is off (or the
// other way round). It only WARNS, it never changes anything by itself.
// =====================================================================

// Words that show an alcoholic drink (no accents, lower case, ONE word each)
const ALCOHOL_WORDS = [
  "cerveja", "cervejas", "chopp", "chope", "vinho", "vinhos", "espumante", "champanhe", "champagne",
  "cachaca", "pinga", "whisky", "whiskey", "uisque", "vodka", "vodca", "gin", "rum", "tequila",
  "licor", "conhaque", "caipirinha", "caipiroska", "caipifruta", "aperol", "campari", "cooler",
  "smirnoff", "sidra", "saque", "absinto", "batida", "drink",
];

// Phrases that clearly say "NO alcohol" (no accents, lower case)
const SAYS_NO_ALCOHOL = ["sem alcool", "zero alcool", "nao alcoolico", "nao alcoolica", "0.0", "0,0", "0%"];

// Words of drinks that are never alcoholic. They cancel a match like "gin" in "gengibre"
const NON_ALCOHOL_DRINKS = ["suco", "agua", "refrigerante", "gengibre", "kombucha", "zero"];

// The name without accents, in lower case: "Cachaça" -> "cachaca"
function plainText(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Does the name say "no alcohol"?  ("Cerveja Heineken 0.0", "Caipirinha sem álcool")
function saysNoAlcohol(name) {
  const text = plainText(name);
  return SAYS_NO_ALCOHOL.some((phrase) => text.includes(phrase));
}

// Does the name look like an alcoholic drink?
function looksAlcoholic(name) {
  const text = plainText(name);

  // A clearly non-alcoholic name is never alcoholic
  if (saysNoAlcohol(name)) return false;
  if (NON_ALCOHOL_DRINKS.some((word) => text.includes(word))) return false;

  // Cut the name into whole words, so "gin" does not match "original"
  const wordsInName = text.split(/[^a-z0-9]+/);
  return ALCOHOL_WORDS.some((word) => wordsInName.includes(word));
}

// Compares the name with the flag.
//   returns "missing"  -> the name looks alcoholic, but the flag is OFF
//   returns "wrong"    -> the name says "no alcohol", but the flag is ON
//   returns null       -> all fine
function checkAlcoholFlag(name, flagValue) {
  const flagIsOn = toFlag(flagValue);
  if (!flagIsOn && looksAlcoholic(name)) return "missing";
  if (flagIsOn && saysNoAlcohol(name)) return "wrong";
  return null;
}


// =====================================================================
// 6. COUNTING CHANGES, STEPS, HISTORY
// =====================================================================

// Counts the changes by kind. Used in the summary and in the history.
// Returns something like { edits: 3, newItems: 2, newGroups: 1, ... }
function countChanges(changes) {
  const counts = {
    edits: 0, newItems: 0, newGroups: 0, newComplements: 0, newOptions: 0,
    links: 0, images: 0, banners: 0, deletes: 0,
  };
  for (const change of changes) {
    if (change.type === "update" || change.type === "group-update" || change.type === "comp-update" || change.type === "option-update") counts.edits++;
    else if (change.type === "create") counts.newItems++;
    else if (change.type === "group-create") {
      counts.newGroups++;
      counts.newItems += (change.group.itens || []).filter((item) => !item._delete).length;
    }
    else if (change.type === "comp-create") counts.newComplements++;
    else if (change.type === "option-create") counts.newOptions++;
    else if (change.type === "link") counts.links++;
    else if (change.type === "image") counts.images++;
    else if (change.type === "group-image") counts.banners++;
    else if (change.type === "delete" || change.type === "option-delete" || change.type === "comp-delete" || change.type === "unlink") counts.deletes++;
  }
  return counts;
}

// A short sentence from the counts: "3 edições, 2 itens novos"
function describeCounts(counts) {
  const parts = [];
  if (counts.edits) parts.push(`${counts.edits} edição(ões)`);
  if (counts.newGroups) parts.push(`${counts.newGroups} grupo(s) novo(s)`);
  if (counts.newItems) parts.push(`${counts.newItems} item(ns) novo(s)`);
  if (counts.newComplements) parts.push(`${counts.newComplements} grupo(s) de complementos`);
  if (counts.newOptions) parts.push(`${counts.newOptions} opção(ões) nova(s)`);
  if (counts.links) parts.push(`${counts.links} ligação(ões)`);
  if (counts.images) parts.push(`${counts.images} imagem(ns)`);
  if (counts.banners) parts.push(`${counts.banners} banner(s)`);
  if (counts.deletes) parts.push(`${counts.deletes} exclusão(ões)`);
  if (counts.deletedGroups) parts.push(`${counts.deletedGroups} grupo(s) apagado(s)`);
  if (counts.deletedComplements) parts.push(`${counts.deletedComplements} grupo(s) de complementos apagado(s)`);
  return parts.length > 0 ? parts.join(", ") : "nada";
}

// Estimates how many requests will be sent (for the progress bar).
// It is only an estimate: some things are only known during the work
// (for example the items inside a new group). The bar adjusts itself.
function estimateSteps(buckets) {
  const groupIds = new Set([...buckets.groupUpdates.keys(), ...buckets.groupImageRefs.keys()]);
  const itemIds = new Set([...buckets.itemUpdates.keys(), ...buckets.imageRefs.keys()]);

  let total = groupIds.size + itemIds.size;
  total += buckets.compGroupUpdates.size + buckets.optionUpdates.size;
  total += buckets.optionCreates.size + buckets.optionDeletes.length;
  total += buckets.compDeletes.length + buckets.unlinks.length;

  for (const change of buckets.groupCreates) {
    total += 1; // the group
    for (const item of change.group.itens || []) {
      if (item._delete) continue;
      total += 1 + (item.complement_group_ids || []).length; // the item + its links
    }
  }
  for (const change of buckets.itemCreates) {
    total += 1 + (change.item.complement_group_ids || []).length;
  }
  total += buckets.complementCreates.length;
  total += buckets.links.length;
  total += buckets.deletes.length;
  return total;
}

// Makes one line of the history of applies
function buildHistoryEntry({ storeId, storeName, ok, error, counts, canUndo, partial }) {
  return {
    id: Date.now(),
    at: Date.now(),
    storeId: String(storeId),
    storeName: storeName || "",
    ok: Boolean(ok),
    error: error || "",
    counts: counts,
    canUndo: Boolean(canUndo),
    partial: Boolean(partial), // true = stopped in the middle
    undone: false,
    kind: "apply", // the undo code changes this to "undo"
  };
}

// Is this the DEFAULT menu that every store gets when it is created?
// It has no complement groups and only ONE group ("Promoções") with ONE
// item ("Item teste", R$ 10, no image). A backup of it is useless, so the
// extension skips the backup for this store.
// "menu" and "complementGroups" are the full copies saved at export time.
function isDefaultStore(menu, complementGroups) {
  if (!Array.isArray(menu) || !Array.isArray(complementGroups)) return false;
  if (complementGroups.length !== 0 || menu.length !== 1) return false;

  const group = menu[0];
  const items = group.itens_all || group.itens || [];
  if (String(group.name).trim().toLowerCase() !== "promoções") return false;
  if (group.image || items.length !== 1) return false;

  const item = items[0];
  return String(item.name).trim().toLowerCase() === "item teste"
    && Number(item.price1) === 10
    && !item.image;
}

// Name of the backup file, so that it is easy to tell which store it belongs to.
// Example: "backup-adega-16k-233712-2026-11-21_20-39.json"
function buildBackupFileName(storeName, storeId, date) {
  const pad = (n) => String(n).padStart(2, "0");
  const when = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;

  // Name without accents/symbols, lower case, words joined by "-"
  const cleanName = String(storeName || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const namePart = cleanName ? `${cleanName}-` : "";
  return `backup-${namePart}${storeId}-${when}.json`;
}

// Items/groups in "freshList" whose id is NOT in "knownIds" are the new ones.
// Returns the list of new ids.
function findNewIds(freshList, knownIds) {
  const known = new Set(knownIds);
  return freshList.filter((thing) => !known.has(thing.id)).map((thing) => thing.id);
}


// =====================================================================
// 7. TEXTS
// =====================================================================

// Looks for the store NAME inside an answer of the platform.
//   - When the answer IS the store itself (GET /stores/123), pass
//     topLevelIsStore = true: the name is "data.name".
//   - Otherwise (for example the answer of saving a group) the store is
//     inside "data.store". We must NOT use the top-level "name" there,
//     because that one is the name of the group, not of the store.
function pickStoreName(data, topLevelIsStore = false) {
  if (!data || typeof data !== "object") return null;
  if (data.store && typeof data.store.name === "string" && data.store.name) return data.store.name;
  if (topLevelIsStore && typeof data.name === "string" && data.name) return data.name;
  if (data.data && typeof data.data === "object") return pickStoreName(data.data, topLevelIsStore);
  return null;
}

// Same idea for the store ID that goes with that name
function pickStoreIdOfName(data, topLevelIsStore = false) {
  if (!data || typeof data !== "object") return null;
  if (data.store && data.store.id !== undefined) return String(data.store.id);
  if (topLevelIsStore && data.id !== undefined) return String(data.id);
  if (data.data && typeof data.data === "object") return pickStoreIdOfName(data.data, topLevelIsStore);
  return null;
}

// The "address" of a store in the public menu (the part after instadelivery.com.br/),
// for example "komasalgadosepizza". The save answers carry it in store.url.
// "topLevelIsStore" = true when "data" IS the store (the answer of GET /stores/{id}).
function pickStoreSlug(data, topLevelIsStore = false) {
  if (!data || typeof data !== "object") return null;
  if (data.store && typeof data.store.url === "string" && data.store.url) return data.store.url;
  if (topLevelIsStore && typeof data.url === "string" && data.url) return data.url;
  if (data.data && typeof data.data === "object") return pickStoreSlug(data.data, topLevelIsStore);
  return null;
}

// Cleans what a person typed as the store address. It accepts the full link
// (https://instadelivery.com.br/komasalgadosepizza) or just the last part.
// Returns "" when it does not look like an address.
function cleanStoreSlug(text) {
  let value = String(text || "").trim();
  value = value.replace(/^https?:\/\/[^/]+\//i, "").split(/[/?#]/)[0];
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : "";
}

// The logo link inside the answer of GET /stores/by-slug/{slug}  (it is in design.logo)
function pickStoreLogo(data) {
  if (!data || typeof data !== "object") return null;
  const logo = data.design && data.design.logo;
  return typeof logo === "string" && /^https:\/\//i.test(logo) ? logo : null;
}

// The single text that the "Copiar prompt + menu" button puts in the clipboard.
// The person only has to paste it into the AI chat.
function buildAiMessage(promptText, exportText, requestText) {
  const request = (requestText || "").trim() || "(escreva aqui o que você quer mudar)";
  return [
    promptText.trim(),
    "",
    "=====",
    "",
    "## MY EXPORT",
    "",
    "```json",
    exportText.trim(),
    "```",
    "",
    "## MY REQUEST",
    "",
    request,
    "",
  ].join("\n");
}

// The diagnostic report that people send to support.
// IMPORTANT: it NEVER contains the token (the login key).
function buildDiagnosticReport(info) {
  const lines = [];
  lines.push("=== Relatório de diagnóstico ===");
  lines.push(`Versão da extensão: ${info.version}`);
  lines.push(`Data: ${new Date().toISOString()}`);
  lines.push(`Navegador: ${info.userAgent || "?"}`);
  lines.push(`Token capturado: ${info.hasToken ? "sim" : "NÃO"}${info.tokenAge ? " (" + info.tokenAge + ")" : ""}`);
  lines.push(`Loja na aba do editor: ${info.liveStoreId || "nenhuma"}`);
  lines.push(`Loja da última exportação: ${info.exportedStoreId || "nenhuma"}${info.storeName ? ' ("' + info.storeName + '")' : ""}`);
  lines.push(`Cópia do menu: ${info.menuSummary || "nenhuma"}`);
  lines.push(`Modo: ${info.mode || "?"}`);
  lines.push("");
  lines.push("Opções:");
  lines.push(JSON.stringify(info.options || {}));
  lines.push("");
  lines.push("Último Aplicar:");
  if (info.lastApply) {
    const a = info.lastApply;
    lines.push(`  ${new Date(a.at).toISOString()} · loja ${a.storeId} · ${a.ok ? "OK" : "ERRO"} · ${describeCounts(a.counts)}`);
    if (a.error) lines.push(`  erro: ${a.error}`);
  } else {
    lines.push("  (nenhum)");
  }
  lines.push("");
  lines.push("Últimas requisições (mais novas por último):");
  const recent = (info.requests || []).slice(-15);
  if (recent.length === 0) lines.push("  (nenhuma)");
  for (const r of recent) {
    const time = r.t ? new Date(r.t).toISOString().slice(11, 19) : "--:--:--";
    lines.push(`  ${time} ${r.method} ${r.path} ${r.status ?? "ERR"} ${r.ms ?? ""}${r.error ? " | " + String(r.error).slice(0, 200) : ""}`);
  }
  return lines.join("\n");
}

// Lets Node load this file for tests. The browser ignores this block.
if (typeof module !== "undefined") {
  module.exports = {
    WEEKDAYS, ITEM_FIELD_LIST, ITEM_FIELDS, ITEM_FIELD_SPEC,
    fieldLabel, isBlank, toFlag, dayIsOn, getDaysValue, normalizeDays, expandDays,
    getFieldValue, valuesDiffer, checkFieldValue, toSendValue, describeValue,
    looksAlcoholic, saysNoAlcohol, checkAlcoholFlag,
    countChanges, describeCounts, estimateSteps, buildHistoryEntry, findNewIds, isDefaultStore, buildBackupFileName, pickStoreSlug, cleanStoreSlug, pickStoreLogo,
    pickStoreName, pickStoreIdOfName, buildAiMessage, buildDiagnosticReport,
  };
}
