const isCrunchyroll = window.location.hostname.includes("crunchyroll.com");
const isNetflix = window.location.hostname.includes("netflix.com");

browser.runtime.onMessage.addListener((message) => {
  if (message.type !== "GET_EPISODE") return;

  if (isCrunchyroll) {
    return Promise.resolve({
      animeName: document.querySelector('[class*="show-title-link"]')?.innerText,
      episodeInfo: document.querySelector('.title')?.innerText,
      pageTitle: document.title,
      source: "crunchyroll"
    });
  }

  if (isNetflix) {
    const el = document.querySelector('[data-uia="video-title"]');
    const epNum = el?.querySelector('span:first-of-type')?.innerText;
    const epTitle = el?.querySelector('span:last-of-type')?.innerText;
    const episodeInfo = [epNum, epTitle].filter(Boolean).join(' · ');
    return Promise.resolve({
      animeName: el?.querySelector('h4')?.innerText,
      episodeInfo,
      pageTitle: document.title,
      source: "netflix"
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

if (isNetflix) {
  let lastAnimeName = "";
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastAnimeName = "";
      if (!location.href.includes("/watch/")) {
        browser.runtime.sendMessage({ type: "EPISODE_CLEARED" });
      }
    }

    const el = document.querySelector('[data-uia="video-title"]');
    const animeName = el?.querySelector('h4')?.innerText;
    if (animeName && animeName !== lastAnimeName) {
      lastAnimeName = animeName;
      browser.runtime.sendMessage({ type: "TITLE_CHANGED", pageTitle: document.title });
    }
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true
  });
}
