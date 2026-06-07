const isCrunchyroll = window.location.hostname.includes("crunchyroll.com");

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "GET_EPISODE" && isCrunchyroll) {
    return Promise.resolve({
      animeName: document.querySelector('[class*="show-title-link"]')?.innerText,
      episodeInfo: document.querySelector('.title')?.innerText,
      pageTitle: document.title,
      source: "crunchyroll"
    });
  }
});

if (isCrunchyroll) {
  let lastTitle = document.title;

  const observer = new MutationObserver(() => {
    if (document.title !== lastTitle) {
      lastTitle = document.title;
      browser.runtime.sendMessage({ type: "TITLE_CHANGED", pageTitle: document.title });
    }
  });

  observer.observe(document.head, {
    subtree: true,
    characterData: true,
    childList: true
  });
}
