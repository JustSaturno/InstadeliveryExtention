# Privacy Policy: Menu JSON Tool for InstaDelivery

Last updated: [date]

This policy explains what the browser extension **Menu JSON Tool for InstaDelivery** ("the extension") does with data. It is written to be short and exact.

## The short version

The extension works entirely inside your browser. It has no server of its own. We (the developer) do not receive, collect, store, sell or share any of your data.

## What the extension handles, and why

| Data | What it is | Why | Where it goes |
|---|---|---|---|
| Login token | The authorization value your browser sends to app.instadelivery.com.br when you use the menu editor | So the extension can call the same platform API as the editor, on your behalf, without asking for your password | Kept only in the browser's **session storage** (cleared when the browser closes). Never shown, never saved to disk, and sent only back to app.instadelivery.com.br |
| Store ID | The number of the store open in the editor | To know which store to read and update | Session storage |
| Menu content | Names, descriptions, prices, order, visibility, images and complement groups of your own store | To export it, compare it with the edited version you paste, and apply the changes you approve | A copy is kept in the browser's **local storage** on your device. It is sent only to app.instadelivery.com.br when you click Apply |
| Images | Pictures from the platform's image catalogues, and pictures from links you put in the JSON | To show a preview and to upload the picture to your item or group | Downloaded to your browser, resized there, and uploaded to app.instadelivery.com.br |
| Options | Your settings (safety switches, image settings, theme) | To remember your choices | Local storage on your device |
| Store name | The name of the store, found in answers of the platform, or typed by you | To show clearly which store you are working on, so you do not edit the wrong one | Local storage on your device |
| History of applies and undo data | The date, store, counts, and the previous values of the items and groups you changed (and the ids of items you created) in your last applies | To show you the history and let you undo the last apply | Local storage on your device. Used only when you click Undo, which sends requests to app.instadelivery.com.br |
| "My request" text | The text you type in the request box | So you do not lose it if you close the panel | Local storage on your device |
| Editor captures (developer feature) | The form fields of the save requests you make in the platform's own editor, without the token, last 15 | To help the developer learn how the platform saves data | Session storage only, cleared on browser close, never sent anywhere |

## What the extension does NOT do

- It does not send any data to the developer or to any third party.
- It has no analytics, tracking, advertising or remote logging.
- It does not sell data or use it for any purpose other than the one described above.
- It does not read your clipboard. It only writes to it when you press a Copy button or use the "copy after export" option. When you use "Copy prompt + menu + request", the text goes to your clipboard only; what you do with it (for example pasting it into an AI assistant you choose) is your own decision, and that service's policy applies to it.
- The diagnostic report (a button you press) never contains the login token.
- It does not run inside web pages, does not inject scripts, and does not block or change the requests of other websites.
- It does not load or run remote code.

## Network connections

The extension connects only to:
- `app.instadelivery.com.br` (the platform API: read the menu, save your approved changes);
- the platform's image storage on `digitaloceanspaces.com` (download pictures from the image catalogues);
- another website **only if** you put an image link from that website in your JSON and then allow the browser's permission prompt.

## Your control

- Close the browser to clear the token and the store ID.
- Use "Apagar cópia salva do menu" (Advanced tab) to delete the saved menu copy, "Limpar histórico" (History tab) to delete the history and undo data, or remove the extension to delete everything it stored.
- Nothing is changed in your store until you click "Aplicar mudanças", and the "Simulação" option lets you check what would be sent without sending it.

## Changes to this policy

If the extension ever starts sending data anywhere else, this policy will be updated first, and the change will be described in the extension's release notes.

## Contact

[your name or company] · [your verified contact email]
