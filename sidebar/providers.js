const ADAPTERS = {
  gemini: {
    buildUrl: (provider, model) =>
      `${provider.baseUrl}/models/${model}:generateContent?key=${provider.apiKey}`,
    buildHeaders: () => ({ "Content-Type": "application/json" }),
    buildBody: (_provider, model, systemPrompt, history) => ({
      system_instruction: { parts: [{ text: systemPrompt }] },
      tools: [{ google_search: {} }],
      contents: history
    }),
    parseResponse: (data) => {
      const parts = data.candidates?.[0]?.content?.parts;
      return parts?.find(p => p.text)?.text;
    },
    fetchModels: {
      buildUrl: (provider) => `${provider.baseUrl}/models?key=${provider.apiKey}`,
      buildHeaders: () => ({ Accept: "application/json" }),
      parseResponse: (data) =>
        (data.models || []).map(m => m.name.replace(/^models\//, ""))
    }
  },

  openai: {
    buildUrl: (provider) => `${provider.baseUrl}/chat/completions`,
    buildHeaders: (provider) => ({
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...(provider.extraHeaders || {})
    }),
    buildBody: (provider, model, systemPrompt, history) => ({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({
          role: h.role === "model" ? "assistant" : h.role,
          content: h.parts.map(p => p.text).join("")
        }))
      ]
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    fetchModels: {
      buildUrl: (provider) => `${provider.baseUrl}/models`,
      buildHeaders: (provider) => ({
        Authorization: `Bearer ${provider.apiKey}`,
        Accept: "application/json",
        ...(provider.extraHeaders || {})
      }),
      parseResponse: (data) => (data.data || []).map(m => m.id)
    }
  },

  openaiCompatible: {
    buildUrl: (provider) => `${provider.baseUrl}/chat/completions`,
    buildHeaders: (provider) => ({
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...(provider.extraHeaders || {})
    }),
    buildBody: (provider, model, systemPrompt, history) => ({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({
          role: h.role === "model" ? "assistant" : h.role,
          content: h.parts.map(p => p.text).join("")
        }))
      ]
    }),
    parseResponse: (data) => data.choices?.[0]?.message?.content,
    fetchModels: {
      buildUrl: (provider) => `${provider.baseUrl}/models`,
      buildHeaders: (provider) => ({
        Authorization: `Bearer ${provider.apiKey}`,
        Accept: "application/json",
        ...(provider.extraHeaders || {})
      }),
      parseResponse: (data) => (data.data || []).map(m => m.id)
    }
  },

  anthropic: {
    buildUrl: (provider) => `${provider.baseUrl}/messages`,
    buildHeaders: (provider) => ({
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      ...(provider.extraHeaders || {})
    }),
    buildBody: (provider, model, systemPrompt, history) => ({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: history.map(h => ({
        role: h.role === "model" ? "assistant" : h.role,
        content: h.parts.map(p => p.text).join("")
      }))
    }),
    parseResponse: (data) =>
      data.content?.find(c => c.type === "text")?.text,
    fetchModels: {
      buildUrl: (provider) => `${provider.baseUrl}/models`,
      buildHeaders: (provider) => ({
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
        Accept: "application/json",
        ...(provider.extraHeaders || {})
      }),
      parseResponse: (data) => (data.data || []).map(m => m.id)
    }
  }
};

const BUILT_IN_PROVIDERS = [
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    adapter: "gemini",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"]
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    adapter: "openai",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"]
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    adapter: "anthropic",
    defaultModel: "claude-3-5-sonnet-20241022",
    models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-5-haiku-20241022"]
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    adapter: "openaiCompatible",
    defaultModel: "openai/gpt-4o-mini",
    models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"],
    extraHeaders: {
      "HTTP-Referer": "https://github.com/anime-assistant",
      "X-Title": "Anime Assistant"
    }
  }
];

const STORAGE_KEYS = {
  activeProviderId: "activeProviderId",
  providerApiKeys: "providerApiKeys",
  providerModels: "providerModels",
  customProviders: "customProviders",
  providerFetchedModelLists: "providerFetchedModelLists",
  legacyGeminiApiKey: "geminiApiKey",
  legacyGeminiModel: "geminiModel"
};

const MODEL_LIST_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function loadProviderState() {
  const stored = await browser.storage.local.get([
    STORAGE_KEYS.activeProviderId,
    STORAGE_KEYS.providerApiKeys,
    STORAGE_KEYS.providerModels,
    STORAGE_KEYS.customProviders
  ]);

  return {
    activeProviderId: stored.activeProviderId || "gemini",
    apiKeys: stored.providerApiKeys || {},
    models: stored.providerModels || {},
    customProviders: stored.customProviders || []
  };
}

async function saveProviderState(state) {
  await browser.storage.local.set({
    [STORAGE_KEYS.activeProviderId]: state.activeProviderId,
    [STORAGE_KEYS.providerApiKeys]: state.apiKeys,
    [STORAGE_KEYS.providerModels]: state.models,
    [STORAGE_KEYS.customProviders]: state.customProviders
  });
}

async function getFetchedModelList(providerId) {
  const stored = await browser.storage.local.get(STORAGE_KEYS.providerFetchedModelLists);
  const entry = (stored[STORAGE_KEYS.providerFetchedModelLists] || {})[providerId];
  if (!entry) return null;
  const expired = Date.now() - entry.fetchedAt > MODEL_LIST_TTL_MS;
  return expired ? null : entry.models;
}

async function saveFetchedModelList(providerId, models) {
  const stored = await browser.storage.local.get(STORAGE_KEYS.providerFetchedModelLists);
  const lists = stored[STORAGE_KEYS.providerFetchedModelLists] || {};
  lists[providerId] = { models, fetchedAt: Date.now() };
  await browser.storage.local.set({ [STORAGE_KEYS.providerFetchedModelLists]: lists });
}

async function migrateLegacySettings() {
  const stored = await browser.storage.local.get([
    STORAGE_KEYS.legacyGeminiApiKey,
    STORAGE_KEYS.legacyGeminiModel
  ]);

  if (stored.geminiApiKey || stored.geminiModel) {
    const state = await loadProviderState();
    state.activeProviderId = "gemini";
    if (stored.geminiApiKey) state.apiKeys.gemini = stored.geminiApiKey;
    if (stored.geminiModel) state.models.gemini = stored.geminiModel;
    await saveProviderState(state);
    await browser.storage.local.remove([
      STORAGE_KEYS.legacyGeminiApiKey,
      STORAGE_KEYS.legacyGeminiModel
    ]);
  }
}

function getBuiltInProvider(id) {
  return BUILT_IN_PROVIDERS.find(p => p.id === id);
}

async function getAllProviders() {
  const state = await loadProviderState();
  const custom = state.customProviders.map(p => ({ ...p, isCustom: true }));
  return [...BUILT_IN_PROVIDERS, ...custom];
}

async function getProvider(id) {
  const all = await getAllProviders();
  const provider = all.find(p => p.id === id);
  if (!provider) return null;

  const state = await loadProviderState();
  return {
    ...provider,
    apiKey: state.apiKeys[id] || "",
    model: state.models[id] || provider.defaultModel
  };
}

async function setActiveProvider(id) {
  const state = await loadProviderState();
  state.activeProviderId = id;
  await saveProviderState(state);
}

async function setProviderApiKey(id, apiKey) {
  const state = await loadProviderState();
  state.apiKeys[id] = apiKey;
  await saveProviderState(state);
}

async function setProviderModel(id, model) {
  const state = await loadProviderState();
  state.models[id] = model;
  await saveProviderState(state);
}

async function addCustomProvider(provider) {
  const { apiKey, model, ...definition } = provider;
  const state = await loadProviderState();
  state.customProviders.push(definition);
  state.activeProviderId = definition.id;
  state.apiKeys[definition.id] = apiKey || "";
  state.models[definition.id] = model || definition.defaultModel;
  await saveProviderState(state);
  return definition.id;
}

async function deleteCustomProvider(id) {
  const state = await loadProviderState();
  state.customProviders = state.customProviders.filter(p => p.id !== id);
  delete state.apiKeys[id];
  delete state.models[id];
  if (state.activeProviderId === id) {
    state.activeProviderId = "gemini";
  }
  await saveProviderState(state);
}

function makeProviderId(name) {
  return "custom-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function callProvider(id, history, systemPrompt) {
  const provider = await getProvider(id);
  if (!provider) throw new Error("Unknown provider");
  if (!provider.apiKey) throw new Error(`No API key set for ${provider.name}`);

  const adapter = ADAPTERS[provider.adapter];
  if (!adapter) throw new Error(`Unknown adapter: ${provider.adapter}`);

  const url = adapter.buildUrl(provider, provider.model);
  const headers = adapter.buildHeaders(provider);
  const body = adapter.buildBody(provider, provider.model, systemPrompt, history);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let errText = "API error";
    try {
      const errJson = await response.json();
      errText = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errText = await response.text();
    }
    throw new Error(errText);
  }

  const data = await response.json();
  const text = adapter.parseResponse(data);
  if (!text) throw new Error("No text in response");
  return text;
}

async function fetchModelsForProvider(provider) {
  if (!provider) throw new Error("Unknown provider");
  if (!provider.apiKey) throw new Error("Save an API key first");

  const adapter = ADAPTERS[provider.adapter];
  const spec = adapter?.fetchModels;
  if (!spec) throw new Error("This provider does not support fetching models");

  const response = await fetch(spec.buildUrl(provider), {
    method: "GET",
    headers: spec.buildHeaders(provider)
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      message = err.error?.message || err.message || message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const data = await response.json();
  return spec.parseResponse(data);
}

async function fetchProviderModels(id) {
  const provider = await getProvider(id);
  const models = await fetchModelsForProvider(provider);
  await saveFetchedModelList(id, models);
  return models;
}
