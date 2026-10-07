export const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
export function parse(html) { return new DOMParser().parseFromString(html, 'text/html'); }
export function safePath(href, origin) {
  try { const url = new URL(href, origin); return url.origin === origin && url.pathname.startsWith('/index.php/judge') ? url.pathname + url.search : null; } catch { return null; }
}
export function route(path) {
  const match = path.match(/\/(studentmain|contestproblemlist|contestprobleminfo|submitpage|status|sample_status)\/(\d+)(?:\/(\d+))?(?:\/(\d+))?/);
  return match ? { kind: match[1], course: match[2], contest: match[3], problem: match[4] } : {};
}
function links(doc, origin, pattern) {
  const seen = new Set();
  return [...doc.querySelectorAll('a[href]')].flatMap(a => {
    const path = safePath(a.getAttribute('href'), origin), match = path?.match(pattern);
    if (!match || seen.has(match[1])) return [];
    seen.add(match[1]); return [{ id: match[1], title: compact(a.textContent), path }];
  });
}
export function courses(doc, origin) { return links(doc, origin, /^\/index\.php\/judge\/studentmain\/(\d+)\/?$/); }
export function contests(doc, origin) { return links(doc, origin, /^\/index\.php\/judge\/contestproblemlist\/\d+\/(\d+)\/?$/); }
export function problems(doc, origin) {
  return links(doc, origin, /^\/index\.php\/judge\/contestprobleminfo\/\d+\/\d+\/(\d+)\/?$/).map(problem => {
    const anchor = [...doc.querySelectorAll('a[href]')].find(a => safePath(a.getAttribute('href'), origin) === problem.path);
    const row = anchor.closest('tr'), cells = [...(row?.querySelectorAll(':scope > td, :scope > th') || [])];
    const status = row?.querySelector('a[href*="/judge/status/"]');
    return { ...problem, number: compact(cells[0]?.textContent), score: compact(cells[3]?.textContent), statusPath: status ? safePath(status.getAttribute('href'), origin) : null };
  });
}
export function statement(doc, origin) {
  const coding = [...doc.querySelectorAll('a[href]')].find(a => /\/judge\/submitpage\//.test(a.getAttribute('href')));
  const root = coding?.closest('.col-md-9') || [...doc.querySelectorAll('.col-md-9')].at(-1);
  if (!root) return { html: '', meta: '', submitPath: null };
  const copy = root.cloneNode(true);
  const metadata = [...copy.querySelectorAll('table')].find(t => /Time limit/i.test(t.textContent) && /Memory limit/i.test(t.textContent));
  const meta = metadata ? [...metadata.querySelectorAll('tbody td')].slice(1).map(c => compact(c.textContent)).join(' · ') : '';
  metadata?.closest('.table-responsive')?.remove();
  for (const el of copy.querySelectorAll('script,style,form,input,button,a.btn,nav,.navbar,footer')) el.remove();
  for (const el of copy.querySelectorAll('[href],[src]')) {
    for (const attr of ['href', 'src']) {
      if (!el.hasAttribute(attr)) continue;
      try { const url = new URL(el.getAttribute(attr), origin); if (url.origin !== origin) el.removeAttribute(attr); else el.setAttribute(attr, url.href); } catch { el.removeAttribute(attr); }
    }
    if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
  }
  const meaningful = compact(copy.textContent) || copy.querySelector('img,object,embed,iframe,svg,math');
  return { html: meaningful ? copy.innerHTML : '', meta, submitPath: coding ? safePath(coding.getAttribute('href'), origin) : null };
}
export function submissionForm(doc, origin) {
  const form = doc.querySelector('#submit_form');
  if (!form) throw Error('이 문제의 제출 폼을 찾지 못했습니다. 원래 OJ 화면을 확인해주세요.');
  const action = safePath(form.getAttribute('action'), origin);
  if (!/^\/index\.php\/judge\/submit\/\d+\/\d+\/\d+\/$/.test(action || '')) throw Error('지원하지 않는 제출 폼입니다.');
  const languages = [...form.querySelectorAll('input[name="lang"]')].map(el => ({ id: el.value, label: compact(el.parentElement.textContent), selected: el.checked, editor: el.id === 'C' ? 'c' : el.id === 'C++' ? 'cpp' : /python/i.test(el.id) ? 'python' : el.id === 'java' ? 'java' : 'plaintext' }));
  const hidden = [...form.querySelectorAll('input[type="hidden"][name]')].map(el => [el.name, el.value]);
  const source = doc.querySelector('#editor')?.textContent || '';
  const disabled = !!form.querySelector('input[type="submit"][disabled]');
  const hasSample = [...form.querySelectorAll('input[type="submit"],button')].some(el => /sample/i.test(el.value || el.textContent));
  return { action, languages, hidden, source, disabled, hasSample };
}
export function results(doc, origin) {
  return [...doc.querySelectorAll('#result-tab tr')].slice(1).flatMap(row => {
    const c = [...row.querySelectorAll(':scope > td, :scope > th')]; if (c.length < 9 || !/^\d+$/.test(compact(c[0].textContent))) return [];
    const link = pattern => { const a = [...row.querySelectorAll('a[href]')].find(a => pattern.test(a.getAttribute('href'))); return a ? safePath(a.getAttribute('href'), origin) : null; };
    return [{ id: compact(c[0].textContent), result: compact(c[3].textContent), score: compact(c[4].textContent), time: compact(c[6].textContent), memory: compact(c[7].textContent), date: compact(c[8].textContent), editPath: link(/\/submitpage\//), sourcePath: link(/\/showsource\//), samplePath: link(/\/sample_status\//), errorPath: link(/\/error\//), pending: /judging|pending/i.test(c[3].textContent) }];
  });
}
export function starter(language) {
  if (language === 'cpp') return '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n';
  if (language === 'python') return '';
  if (language === 'java') return 'public class Main {\n    public static void main(String[] args) {\n        \n    }\n}\n';
  return '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n';
}
