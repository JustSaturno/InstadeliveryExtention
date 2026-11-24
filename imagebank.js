"use strict";

// =====================================================================
// imagebank.js
//
// Finds the best picture in the InstaDelivery image bank for an item.
// Example: item "Coca-Cola Lata 350ml"  ->  bank image "Coca-Cola Lata 350ml"
//
// This file has NO Chrome code, only plain functions. app.js loads the
// bank from the platform and calls these functions.
//
// How the match works, in 4 steps:
//   1. Clean the text: lower case, no accents, no symbols.
//        "Coca-Cola Zero 1,5L"  ->  words: coca cola zero   sizes: 1p5l
//   2. Compare the WORDS of the item with the WORDS of each bank image.
//   3. Give points: shared words, same size, same category.
//   4. The image with the most points wins, but only if it shares enough
//      of the item's words (so we never put a random photo on an item).
// =====================================================================

// Words that do not help to identify a product (we ignore them)
const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "com", "e", "a", "o", "as", "os",
  "no", "na", "nos", "nas", "em", "para", "ao", "um", "uma",
]);

// Different ways to write the same thing.
// Left side: what people write.  Right side: the word(s) we use instead.
// All written WITHOUT accents and in lower case. Add your own lines here!
const SYNONYMS = {
  refri: ["refrigerante"],
  refrigerantes: ["refrigerante"],
  burger: ["burguer"],
  hamburger: ["hamburguer"],
  cheeseburger: ["hamburguer"],
  xis: ["x"],
  milkshake: ["milk", "shake"],
  chopp: ["chop"],
  cerva: ["cerveja"],
  mucarela: ["mussarela"],
  muzzarela: ["mussarela"],
  mussarela: ["mussarela"],
  hotdog: ["hot", "dog"],
  antarctica: ["antartica"],   // the bank has both spellings
  conveniencia: ["convencao"],
};

// Words that only appear in BANNER image names ("Bebidas - Fundo 4"),
// and say nothing about the product. Ignored for the group banner bank.
const BANNER_STOPWORDS = ["fundo", "fundos", "imagem"];

// A size looks like: 350ml, 2l, 1p5l (1,5 litro), 10kg, 500g
const SIZE_PATTERN = /^\d+(p\d+)?(ml|l|kg|g)$/;


// ---------------------------------------------------------------------
// STEP 1: clean the text
// ---------------------------------------------------------------------
function normalizeText(text) {
  let t = String(text || "").toLowerCase();

  // Remove accents (ã -> a, é -> e)
  t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // "1,5" becomes "1p5" so the comma does not split the number
  t = t.replace(/(\d),(\d)/g, "$1p$2");

  // Write sizes in one standard way: "2 litros" / "2 L" -> "2l"
  t = t.replace(/(\d)\s*(litros?|lts?|l)\b/g, "$1l");
  t = t.replace(/(\d)\s*(ml|kg|g)\b/g, "$1$2");

  // Everything that is not a letter or a number becomes a space
  t = t.replace(/[^a-z0-9]+/g, " ").trim();
  return t;
}

// Splits a text into { words: [...], sizes: [...] }
function tokenize(text, extraStop) {
  const parts = normalizeText(text).split(" ").filter(Boolean);
  const words = [];
  const sizes = [];

  for (const part of parts) {
    if (SIZE_PATTERN.test(part)) {
      sizes.push(part);
      continue;
    }
    // Plain numbers ("Hamburguer 4") are only the bank's numbering. Ignore.
    if (/^\d+$/.test(part)) continue;
    if (STOPWORDS.has(part)) continue;
    if (extraStop && extraStop.has(part)) continue;

    if (SYNONYMS[part]) {
      words.push(...SYNONYMS[part]);
    } else {
      // Portuguese plurals: "porcoes" -> "porcao", "paes" -> "pao"
      words.push(part.length > 4 ? part.replace(/(oes|aes)$/, "ao") : part);
    }
  }

  // Remove repeated words
  return { words: Array.from(new Set(words)), sizes: Array.from(new Set(sizes)) };
}


// ---------------------------------------------------------------------
// STEP 2: compare words
// ---------------------------------------------------------------------

// Are these two words "the same"? Singular and plural count as the same:
// "hamburguer" = "hamburgueres", "pizza" = "pizzas".
// It works by counting how many letters they share at the start.
function sameWord(a, b) {
  if (a === b) return true;

  const shortest = Math.min(a.length, b.length);
  if (shortest < 4) return a + "s" === b || b + "s" === a; // short words: identical, or only plural

  let commonStart = 0;
  while (commonStart < shortest && a[commonStart] === b[commonStart]) {
    commonStart++;
  }
  // They may differ only by (about) one letter at the end
  return commonStart >= shortest - 1;
}

// How many of the item's words appear in the bank image's words?
function countSharedWords(itemWords, bankWords) {
  let shared = 0;
  for (const itemWord of itemWords) {
    if (bankWords.some((bankWord) => sameWord(itemWord, bankWord))) shared++;
  }
  return shared;
}

// Does the group name ("Bebidas +18") look like the bank category ("Bebidas")?
function groupMatchesCategory(groupNormalized, categoryName) {
  const firstWord = normalizeText(categoryName).split(" ")[0] || "";
  const start = firstWord.slice(0, 6); // "hamburguer" -> "hambur"
  return start.length >= 4 && groupNormalized.includes(start);
}


// ---------------------------------------------------------------------
// Prepare the bank: clean it once and compute the words of every image
// ---------------------------------------------------------------------
// raw = { categories: [{id, name}], images: [{id, name, url, image_category_id, deleted_at}] }
function prepareBank(raw, extraStopwords) {
  const extraStop = new Set(extraStopwords || []);
  const categoryNames = new Map();
  for (const category of raw.categories || []) categoryNames.set(category.id, category.name);

  const images = [];
  for (const image of raw.images || []) {
    if (image.deleted_at) continue;                      // deleted by the platform
    if (!image.name || !image.url) continue;
    if (/\.bin$/i.test(image.url)) continue;             // not a real image file

    const { words, sizes } = tokenize(image.name, extraStop);
    images.push({
      id: image.id,
      name: image.name,
      url: image.url,
      categoryId: image.image_category_id,
      categoryName: categoryNames.get(image.image_category_id) || "",
      words: words,
      sizes: sizes,
    });
  }
  // Every word that appears in some image name (used to spot unknown words)
  const vocabulary = new Set();
  for (const image of images) {
    for (const word of image.words) vocabulary.add(word);
  }

  return { images, extraStop, vocabulary: Array.from(vocabulary) };
}

// Does the bank know this word? ("teste" is unknown, "calabresa" is known)
function bankKnowsWord(bank, word) {
  return bank.vocabulary.some((known) => sameWord(word, known));
}


// ---------------------------------------------------------------------
// STEP 3 + 4: score every image and pick the best one
// ---------------------------------------------------------------------
// text:       the item's name (or an "image_query" given by the AI)
// groupName:  the menu group of the item ("Bebidas")
// options:    { allowContained: true } accepts a bank name that is fully inside the text
// minRecall:  0 to 1. Share of the item's words that must be found.
//             0.8 = strict, 0.6 = normal, 0.4 = flexible
// Returns { image, score, recall, sizeDiffers } or null (no good match).
function findBankImage(text, groupName, bank, minRecall, options) {
  const item = tokenize(text, bank.extraStop);
  if (item.words.length === 0) return null;

  // Words that NO image in the bank has ("teste", a made-up flavor...) cannot
  // help to choose a picture, so they are ignored instead of lowering the match.
  // The search then works like a person typing the known part in the bank's search box.
  const ignoredWords = item.words.filter((word) => !bankKnowsWord(bank, word));
  item.words = item.words.filter((word) => bankKnowsWord(bank, word));
  if (item.words.length === 0) return null;

  const groupNormalized = normalizeText(groupName);
  let best = null;

  for (const image of bank.images) {
    const shared = countSharedWords(item.words, image.words);
    const recall = shared / item.words.length;          // how much of the item was found
    if (recall < minRecall) continue;                    // not enough in common

    // Safety rule: when only PART of the item's words were found
    // ("Suco de Abacaxi" -> fruit "Abacaxi"), the bank category must
    // match the item's group. Full matches are always allowed.
    const categoryMatches = groupMatchesCategory(groupNormalized, image.categoryName);
    const precision = image.words.length > 0 ? shared / image.words.length : 0;

    // When some words of the item were ignored (unknown to the bank), the picture
    // must NOT have extra words of its own: "Cerveja Skol" must not get a
    // "Cerveja Heineken" photo. The generic "Cerveja" photo is fine.
    if (ignoredWords.length > 0 && precision < 1) continue;

    // Exception (used for group banners): if the WHOLE bank name is inside the
    // text, it is safe. "Cervejas Geladas" contains the banner "Fundo Cervejas".
    const bankNameIsInsideText = shared >= 1 && precision === 1;
    const allowContained = Boolean(options && options.allowContained) && bankNameIsInsideText;

    if (recall < 1 && !categoryMatches && !allowContained) continue;
    // precision: prefers short bank names. Item "Coca-Cola" matches
    // "Coca-Cola 2L" better than "Coca-Cola Zero Pack 12 Unidades".

    let sizePoints = 0;
    let sizeDiffers = false;
    if (item.sizes.length > 0) {
      const sameSize = image.sizes.some((size) => item.sizes.includes(size));
      if (sameSize) sizePoints = 1.5;
      else if (image.sizes.length > 0) { sizePoints = -1; sizeDiffers = true; }
    }

    const categoryPoints = categoryMatches ? 0.5 : 0;

    const score = 4 * recall + precision + sizePoints + categoryPoints;

    if (!best || score > best.score) {
      best = { image, score, recall, sizeDiffers, ignoredWords };
    }
  }
  return best;
}


// ---------------------------------------------------------------------
// Fill "image_url" of the items that have no image
// ---------------------------------------------------------------------
// menu:           the groups of the edited JSON (this function changes it)
// originalGroups: the saved export (to know which items already have an image)
// settings:       { replaceExisting: true/false, minRecall: 0.6 }
// matches:        a Map, filled with  item -> bank image  (to show in the preview)
// warnings:       a list, filled with texts for the warnings box
function fillImagesFromBank(menu, originalGroups, bank, settings, matches, warnings) {
  matches.clear();

  const originalItems = new Map();
  for (const group of originalGroups) {
    for (const item of group.itens_all) originalItems.set(item.id, item);
  }

  const isNew = (id) => id === null || id === undefined || id === 0 || id === "";

  for (const group of menu) {
    if (group._delete) continue;

    for (const item of group.itens || []) {
      if (item._delete) continue;
      if (!item.name) continue;

      // 1. An image_url given by the AI always wins
      if (typeof item.image_url === "string" && item.image_url.trim() !== "") continue;

      // 2. "image_url": null  means "do not use the bank for this item"
      if ("image_url" in item && item.image_url === null) continue;

      // 3. Existing items that already have an image are left alone
      let original = null;
      if (!isNew(item.id)) {
        original = originalItems.get(item.id);
        if (!original) continue; // unknown id (the compare step will warn)
        if (original.image && !settings.replaceExisting) continue;
      }

      // 4. Search the bank ("image_query" is an optional hint from the AI)
      const text = item.image_query || item.name;
      const found = findBankImage(text, group.name, bank, settings.minRecall, { allowContained: true });

      if (!found) {
        warnings.push(`Banco de imagens: nenhuma imagem parecida com "${item.name}" (ficou sem imagem).`);
        continue;
      }

      item.image_url = found.image.url;
      matches.set(item, found.image);

      // The match was not complete (some words were not found or were ignored)
      if (found.ignoredWords.length > 0) {
        warnings.push(`Banco de imagens: "${item.name}" usou "${found.image.name}" (palavras ignoradas: ${found.ignoredWords.join(", ")}). Confira.`);
      } else if (found.recall < 1) {
        warnings.push(`Banco de imagens: "${item.name}" usou "${found.image.name}" (parecida, não idêntica). Confira.`);
      }

      if (found.sizeDiffers) {
        warnings.push(`Banco de imagens: "${item.name}" usou "${found.image.name}", mas o tamanho é diferente. Confira.`);
      }
    }
  }
}


// ---------------------------------------------------------------------
// GROUP BANNERS
// ---------------------------------------------------------------------

// Group names that need a hint, because the name alone points to the wrong picture.
// [pattern in the normalized group name, search text]
const GROUP_HINTS = [
  [/\b18\b|alcool|adega/, "bebidas destiladas"], // "Bebidas +18" -> spirits banner
];

// Looks at the ITEMS of a group and returns the bank category that most of them
// belong to (a category id), or null. Each item "votes" for the category of
// its best picture in the product bank.
function guessCategoryFromItems(group, itemBank, itemMatches, minRecall) {
  const votes = new Map();

  for (const item of group.itens || []) {
    if (item._delete || !item.name) continue;

    // Use the match already found for this item, or search now
    let image = itemMatches.get(item);
    if (!image) {
      const found = findBankImage(item.name, group.name, itemBank, minRecall);
      image = found ? found.image : null;
    }
    if (image && image.categoryId) {
      votes.set(image.categoryId, (votes.get(image.categoryId) || 0) + 1);
    }
  }

  let bestId = null;
  let bestVotes = 0;
  for (const [categoryId, count] of votes) {
    if (count > bestVotes) { bestId = categoryId; bestVotes = count; }
  }
  return bestId;
}

// Fills "image_url" of the GROUPS that have no banner.
//   1. Try the group NAME  (or "image_query") against the banner bank.
//   2. If nothing fits, look at the group's ITEMS and take a banner of
//      the category most of them belong to.
// menu:           groups of the edited JSON (changed by this function)
// originalGroups: the saved export (to know which groups already have a banner)
// groupBank:      the prepared banner bank (/images/2)
// itemBank:       the prepared product bank (/images/1), used for step 2
// settings:       { replaceExisting, minRecall }
// itemMatches:    Map item -> bank image (filled earlier for the items)
// groupMatches:   Map group -> banner image (filled here, for the preview)
function fillGroupImagesFromBank(menu, originalGroups, groupBank, itemBank, settings, itemMatches, groupMatches, warnings) {
  groupMatches.clear();

  const originalById = new Map();
  for (const group of originalGroups) originalById.set(group.id, group);

  const isNew = (id) => id === null || id === undefined || id === 0 || id === "";

  // Group names are short, so we accept a lower share of words
  const minRecall = Math.min(settings.minRecall, 0.5);

  for (const group of menu) {
    if (group._delete || !group.name) continue;

    // An image_url given by the AI always wins
    if (typeof group.image_url === "string" && group.image_url.trim() !== "") continue;
    // "image_url": null means "no automatic banner for this group"
    if ("image_url" in group && group.image_url === null) continue;

    // Existing groups that already have a banner are left alone
    if (!isNew(group.id)) {
      const original = originalById.get(group.id);
      if (!original) continue;
      if (original.image && !settings.replaceExisting) continue;
    }

    // ---- Step 1: by name (or hint) ----
    let query = group.image_query;
    if (!query) {
      const nameNormalized = normalizeText(group.name);
      for (const [pattern, hint] of GROUP_HINTS) {
        if (pattern.test(nameNormalized)) { query = hint; break; }
      }
    }
    let found = findBankImage(query || group.name, group.name, groupBank, minRecall, { allowContained: true });

    // A WEAK name match (some words were ignored, like "Combos Promocionais"
    // -> "combos") must agree with the items inside. If the items point to
    // another category, the items win.
    if (found && found.ignoredWords.length > 0 && itemBank && !query) {
      const itemsCategory = guessCategoryFromItems(group, itemBank, itemMatches, settings.minRecall);
      if (itemsCategory && itemsCategory !== found.image.categoryId) found = null;
    }

    // ---- Step 2: by the items inside the group ----
    let byItems = false;
    if (!found && itemBank) {
      const categoryId = guessCategoryFromItems(group, itemBank, itemMatches, settings.minRecall);
      const image = categoryId ? groupBank.images.find((i) => i.categoryId === categoryId) : null;
      if (image) {
        found = { image, recall: 0, sizeDiffers: false, ignoredWords: [] };
        byItems = true;
      }
    }

    if (!found) {
      warnings.push(`Banner do grupo "${group.name}": nenhuma imagem parecida (ficou sem banner).`);
      continue;
    }

    group.image_url = found.image.url;
    groupMatches.set(group, found.image);

    if (byItems) {
      warnings.push(`Banner do grupo "${group.name}": escolhido pelos itens (categoria "${found.image.categoryName}"). Confira.`);
    } else if (found.recall < 1) {
      warnings.push(`Banner do grupo "${group.name}" usou "${found.image.name}" (parecido, não idêntico). Confira.`);
    }
  }
}

// Lets us test this file in Node (the browser ignores this)
if (typeof module !== "undefined") {
  module.exports = { tokenize, sameWord, prepareBank, findBankImage, fillImagesFromBank, fillGroupImagesFromBank, normalizeText, BANNER_STOPWORDS };
}
