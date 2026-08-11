let activeProviderId = "gemini";
let currentEpisode = null;
let chatHistory = [];
let currentTabId = null;
const tabHistories = {};
let spoilerFree = false;
let useContentScript = false;
const STRUCTURED_HOSTS = ["crunchyroll.com", "netflix.com"];
const STRUCTURED_SOURCES = new Set(["crunchyroll", "netflix"]);

const messagesEl = document.getElementById("messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const statusMsg = document.getElementById("status-msg");
const episodeBar = document.getElementById("episode-info");
const animeNameEl = document.getElementById("anime-name");
const episodeLabelEl = document.getElementById("episode-label");
const clearChatBtn = document.getElementById("clear-chat-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const providerSelect = document.getElementById("provider-select");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeyLabel = document.getElementById("api-key-label");
const modelInput = document.getElementById("model-input");
const modelList = document.getElementById("model-list");
const fetchModelsBtn = document.getElementById("fetch-models-btn");
const saveKeyBtn = document.getElementById("save-key-btn");
const spoilerToggle = document.getElementById("spoiler-toggle");
const manualOverrideRow = document.getElementById("manual-override-row");
const manualInput = document.getElementById("manual-input");
const clearManualBtn = document.getElementById("clear-manual-btn");
const customProviderForm = document.getElementById("custom-provider-form");
const customNameInput = document.getElementById("custom-name");
const customBaseUrlInput = document.getElementById("custom-base-url");
const customAdapterInput = document.getElementById("custom-adapter");
const customModelInput = document.getElementById("custom-model");
const customModelList = document.getElementById("custom-model-list");
const fetchCustomModelsBtn = document.getElementById("fetch-custom-models-btn");
const customApiKeyInput = document.getElementById("custom-api-key");
const saveCustomProviderBtn = document.getElementById("save-custom-provider-btn");
const cancelCustomProviderBtn = document.getElementById("cancel-custom-provider-btn");
const deleteProviderRow = document.getElementById("delete-provider-row");
const deleteProviderBtn = document.getElementById("delete-provider-btn");

async function init() {
  await migrateLegacySettings();

  const state = await loadProviderState();
  activeProviderId = state.activeProviderId;

  await populateProviderSelect();
  await loadProviderUI(activeProviderId);

  const stored = await browser.storage.local.get(["spoilerFree", "manualOverride"]);
  if (stored.spoilerFree !== undefined) {
    spoilerFree = stored.spoilerFree;
    spoilerToggle.checked = spoilerFree;
  }
  if (stored.manualOverride) {
    manualInput.value = stored.manualOverride;
  }

  handleTabChange();
}

async function populateProviderSelect() {
  const providers = await getAllProviders();
  providerSelect.innerHTML = "";

  for (const p of providers) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    providerSelect.appendChild(opt);
  }

  const addOpt = document.createElement("option");
  addOpt.value = "__add_custom__";
  addOpt.textContent = "+ Custom provider...";
  providerSelect.appendChild(addOpt);

  providerSelect.value = activeProviderId;
}

async function loadProviderUI(id) {
  const provider = await getProvider(id);
  if (!provider) return;

  apiKeyLabel.textContent = `${provider.name} API Key`;
  apiKeyInput.value = provider.apiKey || "";
  modelInput.value = provider.model || provider.defaultModel;

  const suggestions = new Set([
    ...(provider.models || []),
    ...(await getFetchedModelList(id) || [])
  ]);
  populateModelDatalist(modelList, [...suggestions]);

  const adapter = ADAPTERS[provider.adapter];
  fetchModelsBtn.style.display = adapter?.fetchModels ? "inline-flex" : "none";

  deleteProviderRow.style.display = provider.isCustom ? "block" : "none";
}

function populateModelDatalist(datalistEl, models) {
  datalistEl.innerHTML = "";
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m;
    datalistEl.appendChild(opt);
  }
}

function updateEpisodeBar(episodeData) {
  currentEpisode = episodeData;
  if (STRUCTURED_SOURCES.has(episodeData.source)) {
    animeNameEl.textContent = episodeData.animeName || episodeData.pageTitle;
    episodeLabelEl.textContent = episodeData.episodeInfo || "";
  } else {
    animeNameEl.textContent = episodeData.pageTitle;
    episodeLabelEl.textContent = episodeData.source === "manual" ? "Manual override" : "";
  }
  episodeBar.style.display = "flex";
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === "EPISODE_CLEARED") {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    updateEpisodeBar({ pageTitle: tabs[0]?.title || "", source: "title" });
    return;
  }

  // Crunchyroll / Netflix: content script notifies title change → re-fetch structured episode data
  if (message.type !== "TITLE_CHANGED") return;
  if (!useContentScript) return;

  const tabId = sender.tab && sender.tab.id;
  if (!tabId) return;

  try {
    const episodeData = await browser.tabs.sendMessage(tabId, { type: "GET_EPISODE" });
    if (episodeData) updateEpisodeBar(episodeData);
  } catch { /* tab not ready */ }
});

// Non-Crunchyroll: use tabs.onUpdated directly — more reliable than content script messaging
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.title || useContentScript || !tab.active) return;

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

  useContentScript = STRUCTURED_HOSTS.some(h => tab.url?.includes(h));
  manualOverrideRow.style.display = useContentScript ? "none" : "block";

  if (!useContentScript) {
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

  const contextSection = STRUCTURED_SOURCES.has(currentEpisode.source)
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

async function callModel(history) {
  return callProvider(activeProviderId, history, buildSystemPrompt());
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

  const provider = await getProvider(activeProviderId);
  if (!provider || !provider.apiKey) {
    setStatus("Please add your API key in settings (gear icon)", true);
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
    const reply = await callModel(sentHistory);
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

providerSelect.addEventListener("change", async () => {
  const value = providerSelect.value;

  if (value === "__add_custom__") {
    customProviderForm.style.display = "block";
    document.getElementById("provider-settings").style.display = "none";
    deleteProviderRow.style.display = "none";
    populateModelDatalist(customModelList, []);
    customNameInput.focus();
    return;
  }

  customProviderForm.style.display = "none";
  document.getElementById("provider-settings").style.display = "block";
  activeProviderId = value;
  await setActiveProvider(activeProviderId);
  await loadProviderUI(activeProviderId);
});

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  await setProviderApiKey(activeProviderId, key);
  setStatus("API key saved!");
  setTimeout(() => setStatus(""), 2000);
});

modelInput.addEventListener("change", async () => {
  const model = modelInput.value.trim();
  if (!model) return;
  await setProviderModel(activeProviderId, model);
});

fetchModelsBtn.addEventListener("click", async () => {
  const provider = await getProvider(activeProviderId);
  if (!provider || !provider.apiKey) {
    setStatus("Save an API key before fetching models", true);
    return;
  }

  fetchModelsBtn.disabled = true;
  fetchModelsBtn.setAttribute("aria-busy", "true");
  setStatus("Fetching models...");

  try {
    const models = await fetchProviderModels(activeProviderId);
    const suggestions = [...new Set([...(provider.models || []), ...models])];
    populateModelDatalist(modelList, suggestions);
    setStatus(`Loaded ${models.length} models`);
    setTimeout(() => setStatus(""), 3000);
  } catch (err) {
    setStatus(`Failed to fetch models: ${err.message}`, true);
  } finally {
    fetchModelsBtn.disabled = false;
    fetchModelsBtn.removeAttribute("aria-busy");
  }
});

fetchCustomModelsBtn.addEventListener("click", async () => {
  const baseUrl = customBaseUrlInput.value.trim().replace(/\/$/, "");
  const adapter = customAdapterInput.value;
  const apiKey = customApiKeyInput.value.trim();

  if (!baseUrl || !adapter || !apiKey) {
    setStatus("Fill in base URL, adapter, and API key to fetch models", true);
    return;
  }

  if (!/^https?:\/\//i.test(baseUrl)) {
    setStatus("Base URL must start with http:// or https://", true);
    return;
  }

  const tempProvider = {
    id: "temp",
    name: "Custom",
    baseUrl,
    adapter,
    apiKey,
    extraHeaders: {}
  };

  fetchCustomModelsBtn.disabled = true;
  fetchCustomModelsBtn.setAttribute("aria-busy", "true");
  setStatus("Fetching models...");

  try {
    const models = await fetchModelsForProvider(tempProvider);
    populateModelDatalist(customModelList, models);
    setStatus(`Loaded ${models.length} models`);
    setTimeout(() => setStatus(""), 3000);
  } catch (err) {
    setStatus(`Failed to fetch models: ${err.message}`, true);
  } finally {
    fetchCustomModelsBtn.disabled = false;
    fetchCustomModelsBtn.removeAttribute("aria-busy");
  }
});

saveCustomProviderBtn.addEventListener("click", async () => {
  const name = customNameInput.value.trim();
  const baseUrl = customBaseUrlInput.value.trim().replace(/\/$/, "");
  const adapter = customAdapterInput.value;
  const model = customModelInput.value.trim();
  const apiKey = customApiKeyInput.value.trim();

  if (!name || !baseUrl || !model) {
    setStatus("Please fill in name, base URL, and model.", true);
    return;
  }

  if (!/^https?:\/\//i.test(baseUrl)) {
    setStatus("Base URL must start with http:// or https://", true);
    return;
  }

  const id = makeProviderId(name);
  const existing = await getProvider(id);
  if (existing) {
    setStatus("A provider with that name already exists.", true);
    return;
  }

  await addCustomProvider({
    id,
    name,
    baseUrl,
    adapter,
    defaultModel: model,
    model,
    apiKey
  });

  customNameInput.value = "";
  customBaseUrlInput.value = "";
  customAdapterInput.value = "openai";
  customModelInput.value = "";
  customApiKeyInput.value = "";
  populateModelDatalist(customModelList, []);
  customProviderForm.style.display = "none";
  document.getElementById("provider-settings").style.display = "block";

  activeProviderId = id;
  await populateProviderSelect();
  await loadProviderUI(activeProviderId);
  setStatus("Custom provider added!");
  setTimeout(() => setStatus(""), 2000);
});

customAdapterInput.addEventListener("change", () => {
  const adapter = ADAPTERS[customAdapterInput.value];
  fetchCustomModelsBtn.style.display = adapter?.fetchModels ? "inline-flex" : "none";
});

cancelCustomProviderBtn.addEventListener("click", () => {
  customNameInput.value = "";
  customBaseUrlInput.value = "";
  customAdapterInput.value = "openai";
  customModelInput.value = "";
  customApiKeyInput.value = "";
  populateModelDatalist(customModelList, []);
  fetchCustomModelsBtn.disabled = false;
  fetchCustomModelsBtn.removeAttribute("aria-busy");
  customProviderForm.style.display = "none";
  document.getElementById("provider-settings").style.display = "block";
  providerSelect.value = activeProviderId;
  loadProviderUI(activeProviderId);
});

deleteProviderBtn.addEventListener("click", async () => {
  if (!confirm("Remove this custom provider?")) return;
  await deleteCustomProvider(activeProviderId);
  activeProviderId = "gemini";
  await populateProviderSelect();
  await loadProviderUI(activeProviderId);
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
