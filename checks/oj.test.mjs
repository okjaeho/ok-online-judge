import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import * as OJ from '../src/oj.js';
import { fixtureRequest } from '../scripts/fixture.mjs';
globalThis.DOMParser = DOMParser;
const origin = 'https://ex-oj.sejong.ac.kr';
const read = path => OJ.parse(fixtureRequest({path,method:'GET'}).response.text);

test('navigation, own status URL and absent statements', () => {
  assert.equal(OJ.courses(read('/index.php/judge'),origin).length,2);
  assert.equal(OJ.contests(read('/index.php/judge/studentmain/2'),origin).length,2);
  const problems=OJ.problems(read('/index.php/judge/contestproblemlist/2/10'),origin);
  assert.equal(problems[0].number,'1');
  assert.equal(problems[0].score,'0 /100');
  assert.match(problems[0].statusPath,/uid=DEMO$/);
  const blank=OJ.statement(read('/index.php/judge/contestprobleminfo/2/11/103'),origin);
  assert.equal(blank.html,'');
  assert.equal(blank.submitPath,'/index.php/judge/submitpage/2/11/103');
  assert.equal(blank.meta,'1000ms · 128MB');
});

test('native form preserves source and both submission modes', () => {
  const form=OJ.submissionForm(read('/index.php/judge/submitpage/2/10/101'),origin);
  assert.equal(form.action,'/index.php/judge/submit/2/10/101/');
  assert.deepEqual(form.languages.map(l=>l.editor),['c','cpp','python']);
  assert.equal(form.hasSample,true);
  const code='#include <stdio.h>\nint main(void){return 0;}';
  for(const mode of ['1','0']) {
    const response=fixtureRequest({path:form.action+mode,method:'POST',fields:[['lang','1'],['real_source_code',code]]}).response;
    const result=OJ.results(OJ.parse(response.text),origin)[0];
    assert.equal(result.result,'Accept');
    assert.equal(Boolean(result.samplePath),mode==='1');
    assert.equal(read(result.sourcePath).querySelector('#editor').textContent,code);
  }
});

test('rejects off-site forms and links', () => {
  assert.equal(OJ.safePath('https://other.example/index.php/judge',origin),null);
  assert.equal(OJ.safePath('javascript:alert(1)',origin),null);
  assert.throws(()=>OJ.submissionForm(OJ.parse('<form id="submit_form" action="https://other.example/submit"></form>'),origin));
});
