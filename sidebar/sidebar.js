let apiKey = "";
let geminiModel = "gemini-2.5-flash";
let currentEpisode = null;
let chatHistory = [];
let currentTabId = null;
const tabHistories = {};
let spoilerFree = false;
let isCrunchyroll = false;
let sidebarWindowId = null;

const messagesEl = document.getElementById("messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const statusMsg = document.getElementById("status-msg");
const episodeBar = document.getElementById("episode-bar");
const animeNameEl = document.getElementById("anime-name");
const episodeLabelEl = document.getElementById("episode-label");
const clearChatBtn = document.getElementById("clear-chat-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const apiKeyInput = document.getElementById("api-key-input");
const saveKeyBtn = document.getElementById("save-key-btn");
const modelInput = document.getElementById("model-input");
const spoilerToggle = document.getElementById("spoiler-toggle");
const manualOverrideRow = document.getElementById("manual-override-row");
const manualInput = document.getElementById("manual-input");
const clearManualBtn = document.getElementById("clear-manual-btn");

async function init() {
  const win = await browser.windows.getCurrent();
  sidebarWindowId = win.id;

  const stored = await browser.storage.local.get(["geminiApiKey", "geminiModel", "spoilerFree", "manualOverride"]);

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
  if (stored.manualOverride) {
    manualInput.value = stored.manualOverride;
  }

  handleTabChange();
}

function updateEpisodeBar(episodeData) {
  currentEpisode = episodeData;
  if (episodeData.source === "crunchyroll") {
    animeNameEl.textContent = episodeData.animeName || episodeData.pageTitle;
    episodeLabelEl.textContent = episodeData.episodeInfo || "";
  } else {
    animeNameEl.textContent = episodeData.pageTitle;
    episodeLabelEl.textContent = episodeData.source === "manual" ? "Manual override" : "";
  }
  episodeBar.style.display = "flex";
}

// Crunchyroll: content script notifies title change → re-fetch structured episode data
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type !== "TITLE_CHANGED") return;
  if (!isCrunchyroll) return;

  const tabId = sender.tab && sender.tab.id;
  if (!tabId) return;

  try {
    const episodeData = await browser.tabs.sendMessage(tabId, { type: "GET_EPISODE" });
    if (episodeData) updateEpisodeBar(episodeData);
  } catch { /* tab not ready */ }
});

// Non-Crunchyroll: use tabs.onUpdated directly — more reliable than content script messaging
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.title || isCrunchyroll || !tab.active || tab.windowId !== sidebarWindowId) return;

  const stored = await browser.storage.local.get("manualOverride");
  if (!stored.manualOverride) manualInput.value = changeInfo.title;
  updateEpisodeBar({
    pageTitle: stored.manualOverride || changeInfo.title,
    source: stored.manualOverride ? "manual" : "title"
  });
});

function switchTabHistory(tabId) {
  if (currentTabId !== null) tabHistories[currentTabId] = chatHistory;
  currentTabId = tabId;
  chatHistory = tabHistories[tabId] || [];
  sendBtn.disabled = false;
  setStatus("");

  messagesEl.innerHTML = "";
  if (chatHistory.length === 0) {
    renderMessage("model", "Hi! I'm your anime assistant. Start watching an anime and ask me anything!");
  } else {
    for (let i = 0; i < chatHistory.length; i++) {
      renderMessage(chatHistory[i].role, chatHistory[i].parts[0].text);
    }
  }
}

async function handleTabChange() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return;
  const tab = tabs[0];

  switchTabHistory(tab.id);

  isCrunchyroll = !!(tab.url && tab.url.includes("crunchyroll.com"));
  manualOverrideRow.style.display = isCrunchyroll ? "none" : "block";

  if (!isCrunchyroll) {
    const stored = await browser.storage.local.get("manualOverride");
    manualInput.value = stored.manualOverride || tab.title || "";
    updateEpisodeBar({
      pageTitle: stored.manualOverride || tab.title || "",
      source: stored.manualOverride ? "manual" : "title"
    });
  } else {
    try {
      const episodeData = await browser.tabs.sendMessage(tab.id, { type: "GET_EPISODE" });
      if (episodeData) updateEpisodeBar(episodeData);
    } catch {
      episodeBar.style.display = "none";
      currentEpisode = null;
    }
  }
}

browser.tabs.onActivated.addListener(() => handleTabChange());

function buildSystemPrompt() {
  const spoilerInstruction = spoilerFree
    ? "IMPORTANT: The user is in SPOILER-FREE mode. Only discuss events that happen IN THIS EPISODE OR BEFORE IT. Never reveal what happens in future episodes."
    : "You may discuss future events if the user asks, but warn them before revealing spoilers.";

  const contextSection = currentEpisode.source === "crunchyroll"
    ? `Here is everything known about what they are watching:
- Anime name: ${currentEpisode.animeName}
- Episode info: ${currentEpisode.episodeInfo}
- Page title: ${currentEpisode.pageTitle}

Use all three fields together to identify the exact anime, season, and episode. The episode number is the absolute episode number across all seasons (not season-relative), so use the anime name and page title to determine the correct season context.`
    : `Here is the page title from the site the user is watching on:
- Page title: ${currentEpisode.pageTitle}

Use this to identify the anime, season, and episode the user is watching.`;

  return `You are an anime assistant helping a user who is currently watching anime.

${contextSection}

To find information, search Google for the anime's fandom wiki (e.g. animename.fandom.com), then use that as your primary source. If the fandom wiki is incomplete or missing information, fall back to Reddit episode discussion threads, then MyAnimeList or AniList.

${spoilerInstruction}

Answer questions about:
- Plot events in this episode
- Character backgrounds and motivations
- Lore, world-building, and power systems
- Context from previous episodes
- Themes and symbolism

If you cannot identify an anime from the context provided, decline to answer and ask the user to specify what they're watching. Only answer questions related to anime — politely decline anything unrelated.

Be concise. Max 3-4 sentences per answer unless the user explicitly asks for more detail. No preamble, no restating the question. If you can't find specific episode information, say so in one sentence.`;
}

async function callGemini(history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: buildSystemPrompt() }]
    },
    tools: [{ google_search: {} }],
    contents: history
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
  const parts = data.candidates?.[0]?.content?.parts;
  const textPart = parts?.find(p => p.text);
  if (!textPart) throw new Error("No text in response");
  return textPart.text;
}

function appendInline(el, text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      const node = document.createElement("strong");
      node.textContent = part.slice(2, -2);
      el.appendChild(node);
    } else if (part.startsWith("`") && part.endsWith("`")) {
      const node = document.createElement("code");
      node.textContent = part.slice(1, -1);
      el.appendChild(node);
    } else if (part.startsWith("*") && part.endsWith("*")) {
      const node = document.createElement("em");
      node.textContent = part.slice(1, -1);
      el.appendChild(node);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  }
}

function renderMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble bubble-${role}`;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) bubble.appendChild(document.createElement("br"));
    const line = lines[i];

    const headingMatch = line.match(/^#{1,3} (.+)/);
    if (headingMatch) {
      const node = document.createElement("strong");
      appendInline(node, headingMatch[1]);
      bubble.appendChild(node);
      continue;
    }

    const bulletMatch = line.match(/^[-*] (.+)/);
    if (bulletMatch) {
      bubble.appendChild(document.createTextNode("• "));
      appendInline(bubble, bulletMatch[1]);
      continue;
    }

    const numberedMatch = line.match(/^(\d+\.) (.+)/);
    if (numberedMatch) {
      bubble.appendChild(document.createTextNode(numberedMatch[1] + " "));
      appendInline(bubble, numberedMatch[2]);
      continue;
    }

    appendInline(bubble, line);
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

  if (!currentEpisode) {
    setStatus("Could not detect current page. Try manual override in settings.", true);
    return;
  }

  const sentTabId = currentTabId;
  const sentHistory = chatHistory;

  renderMessage("user", text);
  userInput.value = "";
  sentHistory.push({ role: "user", parts: [{ text }] });
  setStatus("Thinking...");
  sendBtn.disabled = true;

  try {
    const reply = await callGemini(sentHistory);
    sentHistory.push({ role: "model", parts: [{ text: reply }] });
    if (currentTabId === sentTabId) {
      renderMessage("model", reply);
      setStatus("");
    }
  } catch (err) {
    if (currentTabId === sentTabId) setStatus(`Error: ${err.message}`, true);
  } finally {
    if (currentTabId === sentTabId) sendBtn.disabled = false;
  }
}

clearChatBtn.addEventListener("click", () => {
  chatHistory = [];
  delete tabHistories[currentTabId];
  messagesEl.innerHTML = "";
  renderMessage("model", "Hi! I'm your anime assistant. Start watching an anime and ask me anything!");
});

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

manualInput.addEventListener("input", async () => {
  const value = manualInput.value;
  await browser.storage.local.set({ manualOverride: value });
  updateEpisodeBar({ pageTitle: value, source: "manual" });
});

clearManualBtn.addEventListener("click", async () => {
  await browser.storage.local.remove("manualOverride");
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const title = tabs[0]?.title || "";
  manualInput.value = title;
  updateEpisodeBar({ pageTitle: title, source: "title" });
});

sendBtn.addEventListener("click", sendMessage);

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

init();
