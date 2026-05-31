let apiKey = "";
let geminiModel = "gemini-2.5-flash";
let currentEpisode = null;
let chatHistory = [];
let spoilerFree = false;

const messagesEl = document.getElementById("messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const statusMsg = document.getElementById("status-msg");
const episodeBar = document.getElementById("episode-bar");
const animeName = document.getElementById("anime-name");
const episodeLabel = document.getElementById("episode-label");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const apiKeyInput = document.getElementById("api-key-input");
const saveKeyBtn = document.getElementById("save-key-btn");
const modelInput = document.getElementById("model-input");
const spoilerToggle = document.getElementById("spoiler-toggle");

async function init() {
  const stored = await browser.storage.local.get(["geminiApiKey", "geminiModel", "spoilerFree"]);
  if (stored.geminiApiKey) {
    apiKey = stored.geminiApiKey;
    apiKeyInput.value = stored.geminiApiKey;
  }
  if (stored.geminiModel) {
    geminiModel = stored.geminiModel;
    modelInput.value = geminiModel;
  }
  if (stored.spoilerFree !== undefined) {
    spoilerFree = stored.spoilerFree;
    spoilerToggle.checked = spoilerFree;
  }
  renderMessage("model", "Hi! I'm your anime assistant. Start watching an episode on Crunchyroll and ask me anything!");
}

async function getEpisodeFromTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return { type: "NOT_WATCHING" };
  try {
    const response = await browser.tabs.sendMessage(tabs[0].id, { type: "GET_EPISODE" });
    return response;
  } catch {
    return { type: "NOT_WATCHING" };
  }
}

function setEpisode(episodeData) {
  currentEpisode = episodeData;
  animeName.textContent = episodeData.animeName;
  episodeLabel.textContent = episodeData.episodeInfo;
  episodeBar.style.display = "flex";
  chatHistory = [];
  messagesEl.innerHTML = "";
  renderMessage("model", `Now watching **${episodeData.episodeInfo}** from **${episodeData.animeName}**. Ask me anything!`);
}

function buildSystemPrompt() {
  const spoilerInstruction = spoilerFree
    ? "IMPORTANT: The user is in SPOILER-FREE mode. Only discuss events that happen IN THIS EPISODE OR BEFORE IT. Never reveal what happens in future episodes."
    : "You may discuss future events if the user asks, but warn them before revealing spoilers.";

  return `You are an anime assistant helping a user who is currently watching an anime on Crunchyroll.

Here is everything known about what they are watching:
- Anime name: ${currentEpisode.animeName}
- Episode info: ${currentEpisode.episodeInfo}
- Page title: ${currentEpisode.pageTitle}

Use all three fields together to identify the exact anime, season, and episode. The episode number is the absolute episode number across all seasons (not season-relative), so use the anime name and page title to determine the correct season context.

To find information, search Google for "{animeName} fandom wiki" to locate the anime's fandom wiki (e.g. animename.fandom.com), then use that as your primary source. If the fandom wiki is incomplete or missing information, fall back to Reddit episode discussion threads, then MyAnimeList or AniList.

${spoilerInstruction}

Answer questions about:
- Plot events in this episode
- Character backgrounds and motivations
- Lore, world-building, and power systems
- Context from previous episodes
- Themes and symbolism

Keep answers conversational and concise. If you can't find specific episode information, say so honestly.`;
}

async function callGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: buildSystemPrompt() }]
    },
    tools: [{ google_search: {} }],
    contents: chatHistory
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "API error");
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

function renderMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble bubble-${role}`;

  const parts = text.split(/(\*\*.*?\*\*|\n)/g);
  for (const part of parts) {
    if (part === "\n") {
      bubble.appendChild(document.createElement("br"));
    } else if (part.startsWith("**") && part.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      bubble.appendChild(strong);
    } else {
      bubble.appendChild(document.createTextNode(part));
    }
  }

  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.className = isError ? "error" : "";
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  if (!apiKey) {
    setStatus("Please add your Gemini API key in settings (gear icon)", true);
    return;
  }

  const episodeResponse = await getEpisodeFromTab();

  if (episodeResponse.type === "NOT_WATCHING") {
    setStatus("Please open Crunchyroll and start watching an episode first", true);
    return;
  }

  const episodeChanged = !currentEpisode ||
    currentEpisode.animeName !== episodeResponse.data.animeName ||
    currentEpisode.episodeInfo !== episodeResponse.data.episodeInfo;

  if (episodeChanged) {
    setEpisode(episodeResponse.data);
  }

  renderMessage("user", text);
  userInput.value = "";
  chatHistory.push({ role: "user", parts: [{ text }] });
  setStatus("Thinking...");
  sendBtn.disabled = true;

  try {
    const reply = await callGemini();
    renderMessage("model", reply);
    chatHistory.push({ role: "model", parts: [{ text: reply }] });
    setStatus("");
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
  } finally {
    sendBtn.disabled = false;
  }
}

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("open");
});

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  apiKey = key;
  await browser.storage.local.set({ geminiApiKey: key });
  setStatus("API key saved!");
  setTimeout(() => setStatus(""), 2000);
});

modelInput.addEventListener("change", async () => {
  geminiModel = modelInput.value.trim() || "gemini-2.5-flash";
  await browser.storage.local.set({ geminiModel });
});

spoilerToggle.addEventListener("change", async () => {
  spoilerFree = spoilerToggle.checked;
  await browser.storage.local.set({ spoilerFree });
});

sendBtn.addEventListener("click", sendMessage);

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

init();
