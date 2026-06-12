# Chrome Port Plan

## Overview

Port Anime Assistant from Firefox (MV2) to Chrome (MV3). The sidebar logic, CSS, and content scripts are reusable. The main work is manifest differences, API compatibility, and the sidebar mechanism.

---

## File Structure (Chrome)

```
anime-assistant/
├── manifest.json              ← Firefox (existing)
├── manifest-chrome.json       ← Chrome (new)
├── background.js              ← Chrome service worker (new, small)
├── content.js                 ← shared, no changes
├── sidebar/
│   ├── sidebar.html           ← shared, no changes
│   ├── sidebar.js             ← shared, minor change (polyfill)
│   └── sidebar.css            ← shared, no changes
├── icons/                     ← shared, no changes
└── lib/
    └── browser-polyfill.js    ← webextension-polyfill (new)
```

---

## Step 1 — Add webextension-polyfill

Download `browser-polyfill.js` from:
https://github.com/mozilla/webextension-polyfill/releases

Place at `lib/browser-polyfill.js`.

Add to `sidebar.html` before `sidebar.js`:
```html
<script src="../lib/browser-polyfill.js"></script>
```

Add to `content_scripts` in the Chrome manifest:
```json
"js": ["lib/browser-polyfill.js", "content.js"]
```

This lets all existing `browser.*` calls work in Chrome unchanged.

---

## Step 2 — Create manifest-chrome.json

```json
{
  "manifest_version": 3,
  "name": "Anime Assistant",
  "version": "1.2",
  "description": "Chat with AI about the anime you're watching",
  "permissions": ["activeTab", "tabs", "storage", "sidePanel"],
  "host_permissions": ["<all_urls>", "https://generativelanguage.googleapis.com/*"],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["lib/browser-polyfill.js", "content.js"],
      "run_at": "document_idle"
    }
  ],
  "side_panel": {
    "default_path": "sidebar/sidebar.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "icons": {
    "48": "icons/icon-48.svg",
    "96": "icons/icon-96.svg"
  },
  "action": {
    "default_icon": {
      "48": "icons/icon-48.svg",
      "96": "icons/icon-96.svg"
    },
    "default_title": "Anime Assistant"
  }
}
```

Key differences from Firefox manifest:
- `manifest_version: 3`
- `sidebar_action` → `side_panel`
- `permissions` vs `host_permissions` split (MV3 requirement)
- `action` replaces `browser_action`/`page_action`
- No `browser_specific_settings`
- Requires `background.service_worker`

---

## Step 3 — Create background.js (service worker)

Chrome requires a service worker to open the side panel on toolbar click. Firefox handles this automatically via `sidebar_action`.

```js
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

That's the entire file. One line — tells Chrome to open the side panel when the toolbar icon is clicked, matching Firefox's default behavior.

---

## Step 4 — Test & Verify

Load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repo directory (Chrome will use `manifest.json` — temporarily rename `manifest-chrome.json` to `manifest.json` or use a build step)

Test checklist:
- [ ] Sidebar opens on toolbar icon click
- [ ] Crunchyroll episode detection works
- [ ] Netflix episode detection works
- [ ] Title change detection works (non-CR/Netflix sites)
- [ ] Manual override works
- [ ] Per-tab chat history works
- [ ] API key saves and persists
- [ ] Spoiler-free mode works
- [ ] Clear chat works

---

## Step 5 — Build Setup (optional but recommended)

Since we now have two manifests, add a simple build step to copy the right manifest:

```bash
# Firefox build
cp manifest.json dist-firefox/
# Chrome build  
cp manifest-chrome.json dist-chrome/manifest.json
```

Or use a `package.json` with scripts:
```json
{
  "scripts": {
    "build:firefox": "...",
    "build:chrome": "..."
  }
}
```

---

## Known Risks

| Risk | Likelihood | Notes |
|------|-----------|-------|
| `chrome.sidePanel` not available | Low | Requires Chrome 114+ (June 2023). Very old Chrome versions won't work. |
| Polyfill gaps | Low | `webextension-polyfill` is mature and well-tested. `browser.windows` used in `init()` — verify polyfill covers it. |
| SVG icons not supported | Low | Chrome supports SVG icons in MV3. If issues arise, convert to PNG. |
| `tabs.onUpdated` behavior difference | Low | Should behave the same across browsers. |
| Content script timing differences | Low | `document_idle` works the same in Chrome. |

---

## Effort Estimate

| Task | Time |
|------|------|
| Add polyfill | 10 min |
| Write manifest-chrome.json | 15 min |
| Write background.js | 5 min |
| Add polyfill script tag to sidebar.html | 5 min |
| Testing | 30-60 min |
| **Total** | **~1-1.5 hours** |
