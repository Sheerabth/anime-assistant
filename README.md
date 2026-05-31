# Anime Assistant

Firefox sidebar extension that detects the anime you're watching on Crunchyroll and lets you chat with Gemini AI about it. Uses Google Search grounding to pull episode details from fandom wikis and other anime sources.

## 🚀 Installation

Install the official extension directly from the Mozilla Add-ons store:
👉 **[Get Anime Assistant for Firefox](https://addons.mozilla.org/en-US/firefox/addon/anime-assistant/)**

## Features

- Auto-detects current anime and episode from Crunchyroll
- Chat with Gemini AI about plot, characters, lore, and world-building
- Spoiler-free mode to avoid future episode reveals
- Persistent chat history per episode (resets on episode change)
- Configurable Gemini model

## Setup

### 1. Get a Gemini API key

Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and create a free API key.

### 2. Install the Extension

* **Standard Install:** Head over to the [Mozilla Add-ons Page](https://addons.mozilla.org/en-US/firefox/addon/anime-assistant/) and click **Add to Firefox**.
* **Development/Temporary Install:** 
  1. Open `about:debugging` in Firefox
  2. Click **This Firefox**
  3. Click **Load Temporary Add-on...**
  4. Select `manifest.json` from this directory

### 3. Add your API key

1. Open any page — the sidebar appears under **View → Sidebar → Anime Assistant**
2. Click the ⚙ gear icon
3. Paste your Gemini API key and click **Save API Key**

## Usage

1. Open Crunchyroll and start watching an episode
2. Open the sidebar (View → Sidebar → Anime Assistant)
3. Ask anything about the episode

The extension reads the page title and anime/episode elements from Crunchyroll's DOM. If detection fails (Crunchyroll updates their markup), the content script selectors in `content.js` may need updating.

## Settings

| Setting | Description |
|---|---|
| API Key | Your Gemini API key, stored in `browser.storage.local` |
| Model | Gemini model to use (default: `gemini-2.5-flash`) |
| Spoiler-free mode | Restricts Gemini to events up to the current episode only |

## File Structure

```
anime-assistant/
├── manifest.json       — MV2 extension manifest
├── content.js          — Reads episode info from Crunchyroll DOM
├── sidebar/
│   ├── sidebar.html    — Chat UI
│   ├── sidebar.js      — Gemini API calls, chat logic
│   └── sidebar.css     — Dark theme styling
└── icons/
    ├── icon-48.png
    └── icon-96.png
```

## Notes

- API key is stored locally in Firefox — never sent anywhere except Google's Gemini API
- Gemini API calls are made from the sidebar (privileged extension context), so no CORS issues
- Chat history resets when you switch to a different episode
