// =====================================================================
// gerar-parte-2.js
//
// Makes the "part 2" test file (edits, complement edits and deletes) from
// the REAL export of your test store, because edits need the real ids.
//
// How to use:
//   1. Apply "teste-completo.json" in the extension (part 1 creates things).
//   2. Click "Exportar" and save the export text in a file, for example
//      "export.json" (the text of the box, or the "Copiar" button).
//   3. Run:   node gerar-parte-2.js export.json
//   4. It writes "teste-parte-2-gerado.json". Paste it in the extension.
//   5. Turn ON "Permitir exclusões" in the Options (part 2 deletes things).
//
// Everything is found by NAME, so it works in any store where part 1 was applied.
// =====================================================================

const fs = require("fs");

// ----- Read the export -----
const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Use:  node gerar-parte-2.js export.json");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const groups = data.menu || [];
const compGroups = data.complement_groups || [];

// ----- Small helpers to find things by name -----
function findGroup(name) {
  return groups.find((group) => group.name === name);
}

function findItem(groupName, itemName) {
  const group = findGroup(groupName);
  if (!group) return null;
  const item = group.itens.find((i) => i.name === itemName);
  return item ? { group: group, item: item } : null;
}

function findComp(name) {
  return compGroups.find((comp) => comp.name === name);
}

function findOption(comp, optionName) {
  return comp.complements.find((option) => option.name === optionName);
}

// What we will write in the result file
const menuEdits = new Map();   // group id -> { id, name?, itens: [] }
const compEdits = [];          // complement groups (full records)
const notFound = [];           // things that were not found (to warn)

// Returns the "edit box" of a menu group (created the first time)
function groupBox(group) {
  if (!menuEdits.has(group.id)) menuEdits.set(group.id, { id: group.id, itens: [] });
  return menuEdits.get(group.id);
}

// Adds an item edit:  editItem("Group", "Item", { price1: 10 })
function editItem(groupName, itemName, changes) {
  const found = findItem(groupName, itemName);
  if (!found) {
    notFound.push(`item "${itemName}" no grupo "${groupName}"`);
    return;
  }
  groupBox(found.group).itens.push({ id: found.item.id, ...changes });
}

// ----- 1. Item edits (price, new fields, +18, days) -----
const salada = findItem("TESTE - Hambúrgueres", "X-Salada");
if (salada) {
  editItem("TESTE - Hambúrgueres", "X-Salada", {
    price1: Number(salada.item.price1) + 2,   // price change
    is_highlight: true,                       // new field: highlight
    internal_id: "TESTE-SALADA",              // new field: internal code
  });
} else notFound.push('item "X-Salada"');

const coca = findItem("TESTE - Bebidas", "Coca-Cola Lata 350ml");
if (coca) {
  editItem("TESTE - Bebidas", "Coca-Cola Lata 350ml", {
    description: "Gelada (editado pelo teste)",
    strike_price: Number(coca.item.price1) + 3, // "de R$ X por R$ Y"
    is_best_seller: true,
    days: ["sat", "sun"],                        // only on weekends
    minimum_quantity: 2,
  });
} else notFound.push('item "Coca-Cola Lata 350ml"');

const heineken = findItem("TESTE - Bebidas +18", "Cerveja Heineken 350ml");
if (heineken) {
  editItem("TESTE - Bebidas +18", "Cerveja Heineken 350ml", {
    price1: Number(heineken.item.price1) + 5,
    is_alcohol: true,                            // +18 stays on
  });
} else notFound.push('item "Cerveja Heineken 350ml"');

editItem("TESTE - Combos Promocionais", "Guaraná Antarctica 2L TESTE", { is_invisible: 1 }); // hide

// ----- 2. Delete an item (needs "Permitir exclusões") -----
editItem("TESTE - Imagem Externa", "Item Sem Imagem TESTE", { _delete: true });

// ----- 3. Rename a menu group -----
const bannerGroup = findGroup("TESTE - Banner por Link");
if (bannerGroup) {
  menuEdits.set(bannerGroup.id, { id: bannerGroup.id, name: "TESTE - Banner por Link (renomeado)", itens: [] });
} else notFound.push('grupo "TESTE - Banner por Link"');

// ----- 4. Complement group: rename, max, option price, hide, new option -----
const extras = findComp("Extras TESTE");
if (extras) {
  const edited = JSON.parse(JSON.stringify(extras));
  edited.name = "Extras TESTE (renomeado)";
  edited.max = 5;
  const bacon = findOption(edited, "Bacon");
  if (bacon) bacon.price = Number(bacon.price) + 1;       // price change
  const ovo = findOption(edited, "Ovo");
  if (ovo) ovo.is_invisible = 1;                          // hide an option
  edited.complements.push({ id: null, name: "Cebola caramelizada", price: 4 }); // NEW option
  compEdits.push(edited);
} else notFound.push('grupo de complementos "Extras TESTE"');

// ----- 5. Complement group: all prices +1, delete one option -----
const adicionais = findComp("Adicionais TESTE");
if (adicionais) {
  const edited = JSON.parse(JSON.stringify(adicionais));
  for (const option of edited.complements) option.price = Number(option.price) + 1;
  const presunto = findOption(edited, "Presunto");
  if (presunto) presunto._delete = true;                  // delete an option
  compEdits.push(edited);
} else notFound.push('grupo de complementos "Adicionais TESTE"');

// ----- 6. Delete a whole complement group -----
const toDelete = findComp("Grupo para Apagar TESTE");
if (toDelete) {
  const edited = JSON.parse(JSON.stringify(toDelete));
  edited._delete = true;
  compEdits.push(edited);
} else notFound.push('grupo de complementos "Grupo para Apagar TESTE"');

// ----- 7. Unlink a complement group from an item -----
const xBacon = findItem("TESTE - Hambúrgueres", "X-Bacon");
const ponto = findComp("Ponto da Carne TESTE");
if (xBacon && ponto) {
  const remaining = (xBacon.item.complement_group_ids || []).filter((id) => id !== ponto.id);
  groupBox(xBacon.group).itens.push({ id: xBacon.item.id, complement_group_ids: remaining });
} else notFound.push('item "X-Bacon" ou grupo "Ponto da Carne TESTE"');

// ----- Write the result -----
const result = {
  complement_groups: compEdits,
  menu: Array.from(menuEdits.values()),
};
fs.writeFileSync("teste-parte-2-gerado.json", JSON.stringify(result, null, 2));

console.log("Arquivo criado: teste-parte-2-gerado.json");
if (notFound.length > 0) {
  console.log("\nNÃO ENCONTRADO (a parte 1 foi aplicada nesta loja?):");
  for (const text of notFound) console.log(" - " + text);
}
console.log("\nLembre de ligar 'Permitir exclusões' nas Opções antes de aplicar.");
