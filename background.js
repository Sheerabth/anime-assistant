chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/browser-polyfill.js', 'content.js'],
      });
    } catch {
      // restricted URLs (chrome://, extensions page, etc.) — skip
    }
  }
});
