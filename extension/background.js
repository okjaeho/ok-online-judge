chrome.action.onClicked.addListener(async tab => {
  if (tab?.url && /^https:\/\/(ex-)?oj\.sejong\.ac\.kr\//.test(tab.url)) {
    await chrome.tabs.sendMessage(tab.id, { type: 'ok-oj-open' }).catch(() => chrome.tabs.update(tab.id, { url: new URL('/index.php/judge#ok-oj', tab.url).href }));
  } else {
    await chrome.tabs.create({ url: 'https://ex-oj.sejong.ac.kr/index.php/judge#ok-oj' });
  }
});
