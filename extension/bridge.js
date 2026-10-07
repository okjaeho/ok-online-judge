(() => {
  if (window.top !== window) return;
  let frame;
  const appOrigin = chrome.runtime.getURL('/').replace(/\/$/, '');
  const launch = document.createElement('button');
  launch.textContent = 'ok-online judge';
  launch.style.cssText = 'position:fixed;bottom:22px;right:22px;z-index:2147483000;border:0;border-radius:8px;background:#b4002d;color:#fff;padding:12px 18px;font:600 14px system-ui;box-shadow:0 4px 18px #0003;cursor:pointer';
  document.body.append(launch);
  function open() {
    if (frame) return;
    if (document.querySelector('input[type="password"]')) {
      launch.textContent = '로그인 후 열기';
      sessionStorage.setItem('okOjAfterLogin', '1');
      return;
    }
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('app/index.html');
    frame.title = 'ok-online judge';
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483001;background:#f7f8fa';
    document.body.append(frame);
    document.documentElement.style.overflow = 'hidden';
    document.title = 'ok-online judge';
    launch.hidden = true;
  }
  launch.onclick = open;
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'ok-oj-open') open(); });
  window.addEventListener('message', async event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== appOrigin || event.data?.channel !== 'ok-oj') return;
    const { id, type, payload } = event.data;
    const reply = data => frame?.contentWindow?.postMessage({ channel: 'ok-oj', id, ...data }, appOrigin);
    if (type === 'ready') { reply({ context: { origin: location.origin, path: location.pathname + location.search } }); return; }
    if (type === 'close') { frame.remove(); frame = null; document.documentElement.style.removeProperty('overflow'); document.title = location.hostname.startsWith('ex-') ? 'Ex-Online Judge' : 'Online Judge'; launch.hidden = false; return; }
    if (type !== 'request') return;
    try {
      const url = new URL(payload.path, location.origin);
      if (url.origin !== location.origin || url.username || url.password || !/^\/index\.php\/judge(?:\/(?:studentmain|contestproblemlist|contestprobleminfo|submitpage|status|sample_status|showsource|error|refresh|submit)\/[0-9/]+)?\/?$/.test(url.pathname)) throw Error('지원하지 않는 OJ 요청입니다.');
      const method = payload.method === 'POST' ? 'POST' : 'GET';
      const post = /^\/index\.php\/judge\/submit\/\d+\/\d+\/\d+\/[01]$/.test(url.pathname);
      if ((method === 'POST') !== post) throw Error('잘못된 제출 요청입니다.');
      const body = method === 'POST' ? new URLSearchParams(payload.fields) : undefined;
      if (body && (body.toString().length > 2_000_000 || !body.get('real_source_code') || !body.get('lang'))) throw Error('코드 또는 언어를 확인해주세요.');
      const response = await fetch(url.href, { method, body, credentials: 'same-origin', redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(45000) });
      if (new URL(response.url).origin !== location.origin) throw Error('예상하지 못한 OJ 응답입니다.');
      const text = await response.text();
      if (new URL(response.url).pathname.includes('/auth/') || /<input\b[^>]*type=["']password["']/i.test(text)) throw Error('로그인이 만료됐습니다. 원래 OJ 화면에서 다시 로그인해주세요.');
      if (!response.ok) throw Error(`OJ 응답 오류 (${response.status})`);
      reply({ response: { text, url: response.url, status: response.status } });
    } catch (error) { reply({ error: error.message }); }
  });
  if (location.hash === '#ok-oj' || (sessionStorage.getItem('okOjAfterLogin') === '1' && !document.querySelector('input[type="password"]'))) {
    sessionStorage.removeItem('okOjAfterLogin'); open();
  }
})();
