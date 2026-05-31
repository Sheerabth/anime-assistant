browser.runtime.onMessage.addListener((message) => {
  if (message.type === "GET_EPISODE") {
    if (!window.location.href.includes('/watch/')) {
      return Promise.resolve({ type: "NOT_WATCHING" });
    }

    const animeInfo = {
      animeName: document.querySelector('[class*="show-title-link"]')?.innerText,
      episodeInfo: document.querySelector('.title')?.innerText,
      pageTitle: document.title
    };

    if (!animeInfo.animeName || !animeInfo.episodeInfo) {
      return Promise.resolve({ type: "NOT_WATCHING" });
    }

    return Promise.resolve({ type: "EPISODE_DETECTED", data: animeInfo });
  }
});
