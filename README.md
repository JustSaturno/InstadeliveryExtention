# InstaDelivery Menu Tool

A Chrome extension that lets you **export the menu of an InstaDelivery store as JSON, edit it with an AI, and send the changes back** to the platform, so you don't have to edit items one by one.

The interface is in Portuguese. The code and this README are in English.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Project files](#project-files)
3. [How to install](#how-to-install)
4. [How to use (step by step)](#how-to-use-step-by-step)
5. [The JSON format](#the-json-format)
6. [Options](#options)
7. [The Advanced tab](#the-advanced-tab)
8. [How the code works](#how-the-code-works)
9. [Apply order](#apply-order)
10. [What is NOT supported yet](#what-is-not-supported-yet)
11. [Troubleshooting](#troubleshooting)
12. [Glossary for beginners](#glossary-for-beginners)
    (see also: [Image bank](#image-bank-automatic-images), [Added in v2.5](#added-in-v25), [History and undo](#history-and-undo))

---

## What it does

| Action | Supported |
|---|---|
| Edit item: name, description, `price1`, `price2`, `from_price`, `strike_price`, order, visibility, +18 flag, highlight / best seller / new badges, internal code, minimum quantity, days of the week | Yes |
| Tick / untick each change before applying, progress bar, history, **undo the last apply** (partly, see [Undo](#history-and-undo)) | Yes |
| Show the **store name** big at the top, and confirm it before applying | Yes |
| One-click "Copy prompt + menu + request" for the AI chat | Yes |
| Create items (with an optional image) | Yes |
| Delete items (`"_delete": true`, off by default) | Yes |
| Create groups, edit group name / description / order / visibility | Yes |
| Create complement (add-on) groups and link them to items | Yes |
| Edit existing complement groups (name, min, max, only one, order, description) and options (name, price, description, hidden, order) | Yes |
| Add a new option to an existing complement group | Yes |
| Delete an option of a complement group (`"_delete": true`, needs deletes allowed) | Yes |
| Delete a whole complement group (`"_delete": true` on the group, needs deletes allowed) | Yes |
| Unlink a complement group from an item (remove its id from `complement_group_ids`, needs deletes allowed) | Yes |
| Upload the main item image from an `image_url` | Yes |
| Pick an image automatically from the platform's image bank | Yes |
| Use the store logo for new items that found no picture (option, off by default) | Yes |

---

## Project files

```
your-extension-folder/
├── manifest.json     # Declares the extension to Chrome (name, permissions, files)
├── background.js     # Runs in the background: captures the token and store ID
├── app.html          # The side panel screen (the structure and texts)
├── app.css           # The look of the side panel
├── app.js            # The logic of the side panel (all the buttons and features)
├── menu-helpers.js      # NEW in 2.5: item fields, checks, history, diagnostic (plain functions, no Chrome code)
├── imagebank.js      # Finds the best image of the platform's image bank for an item
├── prompt.txt        # NEW in 2.5: the master AI prompt used by "Copiar prompt + menu + pedido"
└── images/
    └── Logo_Dark2.png   # The logo shown at the top
```

What each file does, in one line:

- **manifest.json**: the "ID card" of the extension. Chrome reads it first.
- **background.js**: a script that keeps running behind the scenes. It watches the editor tab's requests to borrow the login token and the store ID.
- **app.html**: the screen. It only has structure and texts, no logic.
- **app.css**: colors, spacing, light/dark theme.
- **app.js**: the brain. Export, compare, preview, apply, undo, options, Advanced tab.
- **menu-helpers.js**: small plain functions (no Chrome code): which item fields can be edited and how to compare and check them, counting changes, the history entry, the diagnostic report. Tested with Node.
- **imagebank.js**: the image matching. Only plain functions, no Chrome code.
- **prompt.txt**: the text of the master AI prompt. You can edit it with any text editor (for example to change the pricing convention for sizes). It is the same text as `menu-ai-prompt.md`.

---

## How to install

1. Put all the files above in one folder.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose your folder.
5. Pin the extension (puzzle icon, then the pin).
6. Click the extension icon. The side panel opens.

After you change any code, go back to `chrome://extensions` and click the reload icon on the extension card. If you changed `background.js` or `manifest.json`, reloading is required. The token is cleared on reload, so reload the editor tab (F5) afterwards.

---

## How to use (step by step)

1. **Open the menu editor** of the store at `app.instadelivery.com.br` in a normal tab and wait for it to load. Reload with F5 if needed.
2. **Open the side panel** by clicking the extension icon. At the top, the *Token* pill should be green and the **store bar** should show the **name** of the store you are working on.
3. **Write your request** in the "Meu pedido" box (for example: "raise all prices in the Drinks group by 10%", or "coca-cola 2 reais").
4. **Click "Copiar prompt + menu + pedido".** The tool exports the menu right now and copies one text with the master prompt, the current menu and your request. Paste it into an AI chat (Claude, ChatGPT...) and attach menu photos if you have them.
5. **Paste the AI's JSON** in the right box ("Colar o JSON da IA"). The line under the box tells you if the JSON is valid.
6. **Click "Ver mudanças".** Nothing is sent yet. You get a list of every change (each one with a tick box) and a list of warnings.
7. **Read the list carefully.** Untick what you do not want. If something looks wrong, fix the JSON and preview again.
8. **Click "Simular mudanças"** to see the requests that would be sent (nothing is sent), then **"Agora aplicar de verdade"**. Confirm the dialogs. A backup file is downloaded first, then everything is sent with a progress bar ("Enviando 37 de 120").
9. A **summary** appears at the end. Everything is also saved in the **Histórico** tab, where you can undo.

> The "simulate first" step can be turned off in Options ("Simular antes de aplicar").

---

## The JSON format

The export looks like this:

```json
{
  "complement_groups": [
    {
      "id": 10,
      "name": "Extras",
      "min": 0,
      "max": 3,
      "only_one": false,
      "order": 1,
      "complements": [
        { "id": 100, "name": "Bacon", "price": 4 }
      ]
    }
  ],
  "menu": [
    {
      "id": 1,
      "name": "Burgers",
      "description": "",
      "order": 1,
      "is_invisible": 0,
      "itens": [
        {
          "id": 500,
          "name": "Classic Burger",
          "description": "Beef, cheese, lettuce",
          "price1": 25,
          "price2": null,
          "from_price": null,
          "strike_price": null,
          "order": 1,
          "is_invisible": 0,
          "is_alcohol": 0,
          "is_highlight": 0,
          "is_best_seller": 0,
          "is_newest": 0,
          "internal_id": null,
          "minimum_quantity": 0,
          "days": "all",
          "has_image": false,
          "complement_group_ids": [10]
        }
      ]
    }
  ]
}
```

Rules:

- A plain list of groups also works (the same as only the `"menu"` part).
- `"id": null` (or removing the id) means **create a new one**. Existing ids are never changed.
- Items or groups **missing** from your JSON are **never deleted**. To delete an item you need `"_delete": true` **and** the "Permitir apagar itens" option turned on.
- `has_image` is read-only information. To upload an image, add `"image_url": "https://..."` to the item. It must be a direct https link to an image file.
- To link complements to an item, use `complement_group_ids`. You can use ids, or the **name** of a complement group created in the same JSON.
- You can edit existing complement groups (`name`, `description`, `min`, `max`, `only_one`, `order`) and their options (`name`, `price`, `description`, `is_invisible`, `order`). Keep the `id`. To add an option, put it in the group's `complements` with `"id": null`. To delete one, add `"_delete": true` to it (only works with *Permitir exclusões* on, and asks you to type APAGAR). An option that is just left out of the list is **not** deleted. To delete a whole group, add `"_delete": true` to the group. To unlink a group from an item, remove its id from the item's `complement_group_ids`. All deletions need *Permitir exclusões* on and ask you to type APAGAR.
- **Item fields you can change:** `name`, `description`, `price1`, `price2`, `from_price`, `strike_price`, `order`, `is_invisible`, `is_alcohol` (+18), `is_highlight`, `is_best_seller`, `is_newest`, `internal_id`, `minimum_quantity`, `days`. A field you leave out is not touched.
- `days` is `"all"` or the days the item IS sold: `["fri","sat","sun"]` (`sun mon tue wed thu fri sat`).
- On/off fields are `0` or `1`. A value that makes no sense (a price like `"abc"`, a negative price, an unknown day) is **ignored with a warning**.

Example of a new item with an image:

```json
{
  "id": null,
  "name": "Brigadeiro",
  "description": "Chocolate",
  "price1": 6,
  "image_url": "https://example.com/brigadeiro.jpg"
}
```

---

## Options

Saved automatically in the Options tab ("Opções"). The ones marked *(advanced)* only appear when **Modo avançado** is on.

**Safety**
- *Baixar um backup antes de cada Aplicar*: downloads the full current menu as a `.json` file named with the store name and id, for example `backup-adega-16k-233712-2026-11-21_20-39.json` (the store name is also saved inside the file). It is skipped when the store still has the default menu every new store gets (one group "Promoções" with one item "Item teste" and no complements), because a backup of that is useless. The same applies to the backup made by "limpar a loja".
- *Pedir confirmação antes de aplicar*: shows the store NAME, the ID and the number of changes first.
- *Permitir apagar itens*: when off, `_delete` is ignored with a warning.
- *Simular antes de aplicar* (default ON): the first click on Apply only lists what would be sent; the second click sends.
- *Pedir o nome da loja antes de aplicar* (default off): you must type the store name. Recommended for people who manage several stores.
- *Digitar APAGAR para confirmar exclusões* (default ON): deleting needs the typed word.
- *Confirmação extra acima de* (default 50): one more question when an apply has many changes.
- *Somente simulação (dry run)* *(advanced)*: Apply never sends anything. For tests.

**Export**
- *Copiar para a área de transferência após exportar*
- *Incluir grupos de complementos* *(advanced)*: when off, the export has only the menu list.

**Images**
- *Enviar imagens a partir de "image_url"*
- *Tamanho máximo da imagem* *(advanced)*: longest side in pixels (800 to 2000).
- *Qualidade do JPEG* *(advanced)*

**Image bank**
- *Usar o banco de imagens automaticamente*, *Escolher banners dos grupos automaticamente*, *Rigor da busca*, *Trocar também imagens que já existem*, *Usar o logo da loja nos itens sem foto* (new items that the image bank found no picture for get the store logo; the logo link is read from the public menu, `GET /stores/by-slug/{address}` → `design.logo`, with no login; the extension reads the store address (`url`) from `GET /stores/{id}` (it also gives the store name), or from the answer of any save, and only asks you if both fail; items with `"image_url": null` stay without a picture; the review marks them "logo da loja")
- *Como enviar o banner do grupo* *(advanced)*

**Network** *(advanced)*
- *Pausa entre as requisições de salvar*: 0 to 1 second, in case the platform rejects fast requests.

**Appearance**: *Tema*.

**Modo**: *Modo avançado* shows the Advanced tab and the technical options.

**Ajuda e suporte**: the version number, a button to show the "Como usar" guide again, and **Copiar relatório de diagnóstico** (see below).

---

## Added in v2.5

Everything that was added in this version so the tool is safer to use, also by several people (each person has their own separate copy; nothing is shared between users).

**1. Store name, big, at the top.** The bar under the header shows which store you are working on. The name is found in three ways: a saved copy; asking the platform (`GET /stores/{id}`, tried once; if the platform does not answer, nothing breaks); and from the answer of any save (it contains the `store` object). If the name cannot be found, the bar says so and the button **Dar um nome** lets you type a name that is kept on your computer. If the last export is from a different store than the editor tab, the bar turns red and warns you. The same name appears in every confirmation. Optional: *Pedir o nome da loja antes de aplicar*.

**2. Copy prompt + menu + request.** One button that exports the menu *now* and copies [master prompt + menu + your request]. The master prompt is read from `prompt.txt`. What you typed in "Meu pedido" is remembered.

**3. Basic and Advanced mode.** By default the screen is simple (JSON, Histórico, Opções). *Modo avançado* adds the Advanced tab and technical options. First-time users see a 4-step guide ("Como usar") that they can close for good.

**4. Safer apply.**
- Each change has a **tick box** (plus *Marcar todas* / *Desmarcar todas*). Only ticked changes are sent. A link to a new complement group is dropped if that group is not ticked.
- **Simulate first**, **typing APAGAR** to delete, and an **extra confirmation** above a number of changes.
- **Values are checked** before sending: `"price1": "abc"` or a negative price is ignored with a warning, it never reaches the platform. Flags are sent as 1/0.
- **Duplicate warning**: a NEW item or group with the same name as one that already exists gets a warning (this protects you when a run stopped in the middle and you run it again).
- **Progress bar** ("Enviando 37 de 120"). The total is an estimate and grows if needed.
- A **summary** at the end, and a clear message if the connection drops ("Sem conexão com a plataforma").
- After an error the saved menu copy is refreshed, so the next preview only shows what is still missing.

**5. More editable item fields.** On top of the old ones: `strike_price` (crossed-out price), `is_alcohol` (the real +18 flag), `is_highlight`, `is_best_seller`, `is_newest` (0/1 badges), `minimum_quantity`, `internal_id` and `days`. `days` is `"all"` or a list such as `["fri","sat"]` (`sun mon tue wed thu fri sat`); the tool turns it into the seven fields the platform uses. Comparison is smart: `6` equals `"6"`, `0` equals `false`, `null` equals `""`. The field `stock` was left out on purpose because we have no capture of how the platform saves it. If you need it, use the Advanced tab to capture a stock change in the editor.

**6. Diagnostic report.** *Copiar relatório de diagnóstico* (Options) copies the version, browser, store, last apply, options and the last 15 requests. It never contains the token.

---

## History and undo

Every Apply is saved in the **Histórico** tab (last 30): date, store name, what was done, and whether it finished or stopped in the middle.

**Desfazer última aplicação** can:
- put the **edited** fields of items and groups back to their previous values;
- **delete the items that were created** by that apply.

It cannot (the platform gives the tool no way to do it):
- delete **menu groups** that were created (edited complement groups and options **are** put back; options and complement groups you created are deleted; options you deleted are re-created with a new id; unlinked complements are linked again);
- **bring back deleted items** (use the backup file that is downloaded before each apply);
- guarantee that a **replaced image** returns to the previous one.

If someone edited the same item in the platform editor after the apply, undoing overwrites that edit. Only the last apply can be undone. The undo data stays on the computer (`chrome.storage.local`).

---

## The Advanced tab

(Visible only with *Modo avançado*. In the code it is still called `dev`.) For checking and debugging:

- **Status**: token, store, last export, a summary of the saved menu copy, current mode.
- **Testar conexão**: tries to fetch the menu to check that the token works.
- **Zona de perigo: limpar a loja**: deletes the items, then the groups, then the complement groups of the store open in the editor (you can untick each part). Safety: a backup is always downloaded first, you must type the store name and then `LIMPAR TUDO`, and "Somente simulação" only lists. It always reads the store fresh from the platform. It stops on the first error and says what was already deleted. **Important:** deleting items uses the address the platform's own editor uses. Deleting complement groups (`DELETE /stores/group-complements/by-id/{id}`) uses an address confirmed by a capture. Deleting menu groups (`DELETE /stores/group/{id}`) uses an address that is **not verified yet**. If the platform answers 404/405, the tool explains it; capture the delete in the platform editor (Capturas do editor) and change the lines in `WIPE_ENDPOINTS` in `app.js`. It cannot be undone, and it is recorded in the History as "LIMPEZA DA LOJA".
- **Data buttons**: download the raw platform data, delete the saved menu copy, reset all options, refresh the image banks.
- **Registro de requisições**: every request the tool sent, with status and time. Errors show the server's answer.
- **Capturas do editor**: the last 15 saves made in the platform's own editor (without the token). Useful to learn how the platform saves something, so a new feature can copy it.

---

## How the code works

### Big picture

```
 Editor tab (InstaDelivery)          background.js              app.js (side panel)
 ────────────────────────           ───────────────           ─────────────────────
 you browse the editor  ──────────► sees the requests
                                    saves token + store ID ──► reads token + store ID
                                                               from chrome.storage.session

                                                               Export  ─► GET menu + complements
                                                                         saves a copy ("original")
                                                               AI edits the JSON
                                                               Preview ─► compares JSON vs "original"
                                                                         shows changes + warnings
                                                               Apply   ─► sends POST / DELETE requests
```

### Where data is stored (details)

| Place | What | Lifetime |
|---|---|---|
| `chrome.storage.session` | token, token time, store ID, request log, editor captures | Cleared when Chrome closes or the extension reloads. The token is never written to disk. |
| `chrome.storage.local` | options, the copy of the last export (`original`, `originalComps`), `storeId`, `exportedAt`, `storeNames` (store names), `applyHistory` and `lastApply` (history and undo data), `requestDraft` (the "Meu pedido" text), the image bank copies | Stays until you clear it. |

### background.js

Two jobs:

1. **Open the side panel** when you click the icon.
2. **Listen to requests** to `app.instadelivery.com.br`:
   - From the `authorization` header it saves the **token**.
   - From a GET to `/api/stores/group/NUMBER` it saves the **store ID**.
   - For saves (POST, DELETE...) it records the body in the `captured` list (the Dev tab shows it).

### app.js sections

1. **Basic setup**: shortcuts (`$`, `$$`), default options, small helpers.
2. **Options + theme**: load, save and apply the options.
3. **Tabs**: switching between JSON, Histórico, Opções and Avançado (hidden in basic mode).
4. **`api()`**: every request to the platform goes through this one function. It adds the token, logs the request and turns errors into readable messages.
5. **Images**: download from a link, shrink on a canvas, convert to JPEG. *5c: the store name* (saved copy, lookup, learning from answers, manual name).
6. **Export format**: keeps only the fields the AI needs (a "slim" export).
7. **Export button**: fetches menu and complements, saves the copy, fills the box. Also "Copiar prompt + menu + pedido".
8. **Import box**: checks that the pasted JSON is valid as you type.
9. **`computeChanges()`**: the heart of the tool. Compares the original with the edited JSON and returns:
   - `changes`: what will be done
   - `warnings`: what will be ignored, and why
10. **Preview**: draws the list of changes, the counters and the warnings.
11. **Body builders**: create the `FormData` the platform expects. They copy exactly what the platform's own editor sends.
12. **Apply**: sends only the ticked changes, in a safe order (see below), with progress, summary and history. *12b: Undo.*
13. **Advanced tab**: status, logs and captures.
14. **Support**: the "Como usar" guide and the diagnostic report.
15. **Start**: runs `init()` when the panel opens.

### Types of change

Each item in the `changes` list has a `type`:

| type | Meaning |
|---|---|
| `group-create` | new group (with its items) |
| `group-update` | one field of a group changed |
| `create` | new item |
| `update` | one field of an item changed |
| `image` | upload an image for an existing item |
| `comp-create` | new complement group |
| `comp-update` | one field of an existing complement group changed |
| `option-create` | new option in an existing complement group |
| `option-delete` | delete one option of a complement group |
| `comp-delete` | delete a whole complement group |
| `unlink` | unlink a complement group from an item |
| `option-update` | one field of an existing complement option changed |
| `link` | link a complement group to an item |
| `delete` | delete an item |

### Why the tool compares against a saved copy

When you click Export, the full original menu is saved. In Preview, your edited JSON is compared with that copy, so only **real differences** are sent. The platform's save request needs the **whole item**, so the tool merges the original item with the changed fields before sending.

### Why new groups and items need a second lookup

The platform does not return the new id after creating something. So after creating groups, the tool fetches the menu again, finds the groups that were not there before and matches them by **name**. The same is done for new complement groups and new items that need links. For this reason, avoid giving two new items in the same group the same name.

---

## Image bank (automatic images)

InstaDelivery has a bank of ready-made product pictures (the "Banco de Imagens" window in the
editor). The extension uses it so items get a picture even when the AI sends none.

**How it works**
1. `GET /api/images/1` returns the whole bank in one request: `{ categories: [...], images: [...] }`.
   The extension saves a slim copy in `chrome.storage.local` and refreshes it after 7 days
   (or when you click "Atualizar banco de imagens" in the Dev tab).
2. When you click "Ver mudanças", every NEW item and every item WITHOUT an image gets an
   `image_url` filled from the bank. Then the normal image code downloads, shrinks and uploads it.
3. The preview shows each chosen picture with the bank image name, so you can check it
   before applying. Imperfect matches add a warning.

**How the match is chosen** (all in `imagebank.js`)
- Text is cleaned: lower case, no accents, sizes written one way (`2 litros` becomes `2l`).
- The words of the item are compared with the words of every bank image
  (`hamburguer` = `hamburgueres`; `refri` = `refrigerante` through the `SYNONYMS` list).
- Points: shared words, same size (`350ml`), same category as the menu group.
- Words that NO picture in the bank has ("teste", a made-up flavor) are **ignored** when searching, like a person
  typing only the known part in the platform's search box. "Pizza de Calabresa TESTE" finds "Pizza de Calabresa 2".
  When words were ignored, the chosen picture may not have extra words of its own ("Cerveja Skol" gets the generic
  "Cerveja", never "Cerveja Heineken"), and the preview warns which words were ignored.
- The image must contain at least a minimum share of the item's words (the "Rigor da busca"
  option: Rigoroso 80%, Normal 60%, Flexível 40%). Partial matches also need the right category.
  Below the limit the item stays without an image, which is better than a wrong photo.

**Controls in the JSON**
| Field on an item | Effect |
|---|---|
| `"image_url": "https://..."` | Your link always wins over the bank |
| `"image_url": null` | This item does NOT get a bank image |
| `"image_query": "refrigerante lata"` | A search hint used instead of the item name |

**Options:** use the bank (on/off), strictness, and "replace images that already exist" (off by default).

**To improve matches:** add lines to `SYNONYMS` in `imagebank.js`, for example `"pao de queijo": [...]`
(left side without accents, in lower case).

### Group banners

Groups can have a banner picture too. The platform has a second bank for them: `GET /api/images/2`
(names like "Bebidas - Fundo 4", "Fundo Cervejas"). It works like the item bank, with these differences:

1. The group **name** (or an `image_query`) is searched in the banner bank. Filler words such as
   "fundo" and "imagem" are ignored (`BANNER_STOPWORDS`). A lower share of words is enough (50%),
   because group names are short. A banner whose whole name is inside the group name is accepted
   ("Cervejas Geladas" gets "Fundo Cervejas").
2. If the name finds nothing, the **items inside the group** decide: each item votes for the category of
   its best product picture, and a banner of the winning category is used. These get a warning ("Confira").
3. A few names have built-in hints (`GROUP_HINTS` in `imagebank.js`): a group with "+18" uses
   "bebidas destiladas".
4. Existing groups that already have a banner are kept. The option "Escolher banners dos grupos
   automaticamente" turns it on and off. `"image_url": null` blocks it for one group.

**How the banner is sent (confirmed with the editor's own request):** the platform's editor does not
upload a file for a group banner. It sends the picture **link as plain text in two form fields, `image` and `file`**
(`POST /api/stores/group` to create, `POST /api/stores/group/{id}` to edit), and the server downloads the picture and
keeps its own copy (the saved group then has an `image` link under `.../groups/...`). The extension does the same
(mode `bank-url`, the default). Options has a setting "Como enviar o banner do grupo" with experimental modes
(link only in `image`, or uploading the file in `file` or `image`), which gave HTTP 500 in our tests.
Because the server downloads the link, an `image_url` from the AI should work as a group banner too, if it is a direct https image link.

**Limits:** the picture is uploaded again as a new file (the extension does not link to the bank
image itself). To link directly we would need the request the editor sends when you pick a bank image.

---

## "A partir de" prices (`from_price`)

Items can show "A partir de R$ X" when the price depends on a choice (size, flavor). On the platform this is the
item field `from_price` (seen in the editor's own save request). In the JSON:

| Field on an item | Effect |
|---|---|
| `"from_price": 20` | The menu shows "A partir de R$ 20" |
| `"from_price": null` | No "a partir de" (fixed price) |

- The export includes `from_price` for every item, so the AI can see it.
- Creating and editing items both send it. Empty, `null` and `0` all count as "none", and `20` equals `"20"`
  when the extension decides whether a value changed.
- The AI prompt (section 8) tells the AI when to use it (sizes/variants with different prices, or a required
  complement group with different prices; never for optional extras) and how to set it: the lowest total price.
- Pricing convention used by the prompt: the size options carry the **full** price and the item's `price1` is `0`
  (the same combination as the editor's capture: `price1: 0`, `from_price: 20`). If you price sizes differently
  (for example `price1` = smallest size and options = extra amounts), change the line "PRICING CONVENTION" in the prompt.

---

## Apply order

1. Group edits
2. Item edits and images
3. New groups (ids are looked up afterwards)
4. New items
5. New complement groups
6. Complement links
7. Deletes (always last)

**The first error stops everything after it.** The saved menu copy is refreshed, so Ver mudanças afterwards shows only what is still missing (new items that were already created get the "same name" warning, remove them from the JSON). Use **Desfazer** or the backup file if you need to go back.

---

## What is NOT supported yet

- Bringing back a deleted complement group (use the backup file)
- Deleting groups
- Extra photos on items and group images
- Item `stock` (no capture yet)
- Undoing menu group creation and bringing back deleted items or deleted complement groups (see [History and undo](#history-and-undo))

If you need one of these, turn on *Modo avançado*, go to the Advanced tab, clear the captures, do the action once in the platform's own editor, click Refresh and copy the result. That shows exactly which request the platform sends.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| **401 error / "Ainda sem token"** | The token expired. Reload the editor tab (F5), wait for it to load, try again. It is also cleared when you reload the extension. |
| **Store bar says "Nenhuma loja detectada"** | Reload the editor on the menu page so the extension sees the menu request. You can also type the store ID in the field next to the Export button. |
| **Image ignored** | The link is not a direct image file, the site blocks downloads, or the file is too big or broken. Check the warning text. |
| **Wrong store warning** | The editor tab last loaded a different store than your export. Export again from the right store. |
| **"Faça a exportação primeiro"** | Click Export before Preview, so there is a copy to compare with. |
| **Nothing happens after changing the code** | Reload the extension in `chrome://extensions`, then reload the editor tab. |
| **Weird error** | Click *Copiar relatório de diagnóstico* in Options and send it to whoever maintains the tool. Or turn on *Modo avançado* and read the request log. |
| **Store name shows only the number** | The platform did not give the name. Click *Dar um nome* once, it is remembered. |
| **Apply stopped in the middle** | Read the summary, click Export, then Ver mudanças. Only what is left appears. |

To see JavaScript errors: right-click inside the side panel, choose **Inspect**, and open the **Console** tab. For `background.js` errors, click **service worker** on the extension card in `chrome://extensions`.

---

## Glossary for beginners

- **JSON**: a text format for data, with `{ "key": value }` objects and `[ ... ]` lists.
- **API**: the addresses the platform offers so programs can read and save data.
- **Token**: a long text that proves you are logged in. The tool borrows it from the editor tab.
- **Request**: a message sent to the API. `GET` reads, `POST` creates or saves, `DELETE` removes.
- **FormData**: a way to send fields (and files) like an HTML form does. The platform wants this format.
- **Blob**: a chunk of binary data, such as an image file.
- **Canvas**: a drawing board in the browser. Used here to resize images.
- **Promise / async / await**: the way JavaScript waits for slow things (like the network) without freezing the screen. `await` means "wait for this to finish".
- **Service worker**: a script (here `background.js`) that Chrome runs in the background.
- **Side panel**: the panel that opens on the side of the browser window.
- **Dry run**: a rehearsal. It shows what would happen without doing it.
- **Diff**: the list of differences between two versions of something.
