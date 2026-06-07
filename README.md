# Anime Assistant

Firefox sidebar extension that detects the anime you're watching and lets you chat with Gemini AI about it. Uses Google Search grounding to pull episode details from fandom wikis and other anime sources.

Works on **any anime streaming site** — Crunchyroll, Hidive, Netflix, Funimation, and more.

## 🚀 Installation

Install the official extension directly from the Mozilla Add-ons store:
👉 **[Get Anime Assistant for Firefox](https://addons.mozilla.org/firefox/addon/anime-assistant/)**

## Features

- Auto-detects current anime and episode from Crunchyroll (reads DOM for structured title/episode info)
- Works on any other streaming site via page title detection
- Manual override — type what you're watching if auto-detection is wrong
- Chat with Gemini AI about plot, characters, lore, and world-building
- Spoiler-free mode to avoid future episode reveals
- Per-tab chat history — switch tabs freely, each tab keeps its own conversation
- Configurable Gemini model

## Setup

### 1. Get a Gemini API key

Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and create a free API key.

### 2. Install the Extension

* **Standard Install:** Head over to the [Mozilla Add-ons Page](https://addons.mozilla.org/firefox/addon/anime-assistant/) and click **Add to Firefox**.
* **Development/Temporary Install:**
  1. Open `about:debugging` in Firefox
  2. Click **This Firefox**
  3. Click **Load Temporary Add-on...**
  4. Select `manifest.json` from this directory

### 3. Add your API key

1. Open the sidebar under **View → Sidebar → Anime Assistant**
2. Click the ⚙ gear icon
3. Paste your Gemini API key and click **Save API Key**

## Usage

1. Open any anime streaming site and start watching
2. Open the sidebar (View → Sidebar → Anime Assistant)
3. Ask anything about the episode

**On Crunchyroll:** episode info is read directly from the page DOM — title, episode name, and episode number are all detected automatically.

**On other sites:** the page title is used to identify the anime. If the title isn't descriptive enough, use the **"What are you watching?"** manual override in settings to type it in yourself.

## Settings

| Setting | Description |
|---|---|
| API Key | Your Gemini API key, stored in `browser.storage.local` |
| Model | Gemini model to use (default: `gemini-2.5-flash`) |
| Spoiler-free mode | Restricts Gemini to events up to the current episode only |
| What are you watching? | Manual override for sites where title detection is insufficient — click Reset to go back to auto-detection |

## File Structure

```
anime-assistant/
├── manifest.json       — MV2 extension manifest
├── content.js          — Reads episode info from Crunchyroll DOM, watches for title changes
├── sidebar/
│   ├── sidebar.html    — Chat UI
│   ├── sidebar.js      — Gemini API calls, chat logic, tab management
│   └── sidebar.css     — Dark theme styling
└── icons/
    ├── icon-48.svg
    └── icon-96.svg
```

## Notes

- API key stored locally in Firefox — never sent anywhere except Google's Gemini API
- Gemini API calls made from the sidebar (privileged extension context), no CORS issues
- Chat history is per-tab and lives in memory — cleared when the sidebar is closed
- Crunchyroll DOM selectors in `content.js` may need updating if Crunchyroll changes their markup
