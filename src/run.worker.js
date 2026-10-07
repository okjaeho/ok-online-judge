import { createCompiler } from '@live-codes/clang-wasm';
import { loadPyodide } from 'pyodide';
const originalFetch = globalThis.fetch.bind(globalThis);
// Map the compiler's HTTP-shaped asset URLs to files bundled in this extension.
// No source code or runtime assets are requested from an external service.
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const pythonBase = new URL('pyodide/', self.location.href).href;
  if (url.href.startsWith(pythonBase) && /\/(pyodide-lock\.json|python_stdlib\.zip|pyodide\.asm\.(js|wasm))$/.test(url.pathname)) return originalFetch(input, init);
  if (url.origin !== 'https://ok-oj-runtime.invalid' || !/^\/(runtime-manifest\.v1\.json|bin\/(?:memfs\.wasm\.gz|clang\.wasm\.gz|lld\.wasm\.gz|sysroot\.tar\.gz))$/.test(url.pathname)) throw Error('지원하지 않는 실행 파일 요청입니다.');
  return originalFetch(new URL('clang' + url.pathname, self.location.href), init).then(response => new Response(response.body, {status:response.status,statusText:response.statusText,headers:response.headers}));
};
const compilers = new Map();
let python;
async function runPython(code, stdin, id) {
  if (!python) { self.postMessage({id,phase:'Python 준비 중…'}); python=await loadPyodide({indexURL:new URL('pyodide/',self.location.href).href}); }
  self.postMessage({id,phase:'컴파일 및 실행 중…'});
  let consumed=false,output='',stdout='',stderr='';const decoder=new TextDecoder();
  const sink=kind=>({write(bytes){const chunk=decoder.decode(bytes,{stream:true});if(output.length+chunk.length>1_000_000)throw Error('출력량이 1MB를 넘어 실행을 중지했습니다.');output+=chunk;if(kind==='stdout')stdout+=chunk;else stderr+=chunk;return bytes.length;}});
  python.setStdin({stdin:()=>{if(consumed)return null;consumed=true;return new TextEncoder().encode(stdin);},isatty:false});
  python.setStdout(sink('stdout'));python.setStderr(sink('stderr'));
  python.globals.set('__ok_code',code);
  const started=performance.now();
  let exitCode=0;
  try {
    exitCode=python.runPython(`import sys as __ok_sys
__ok_sys.stdin = __ok_sys.__stdin__
__ok_sys.stdout = __ok_sys.__stdout__
__ok_sys.stderr = __ok_sys.__stderr__
__ok_scope = {"__name__": "__main__", "__file__": "main.py"}
__ok_exit = 0
try:
    exec(compile(__ok_code, "main.py", "exec"), __ok_scope)
except SystemExit as __ok_exc:
    if __ok_exc.code is not None:
        if isinstance(__ok_exc.code, int): __ok_exit = __ok_exc.code
        else:
            print(__ok_exc.code, file=__ok_sys.stderr)
            __ok_exit = 1
__ok_sys.stdout.flush()
__ok_sys.stderr.flush()
__ok_exit`);
  } catch (error) { stderr+=error.message;output+=error.message;exitCode=1; }
  return {stdout,stderr,output,errors:[],exitCode,compileMs:0,runMs:Math.round(performance.now()-started),runtime:'Python '+python.runPython('import sys; sys.version.split()[0]')};
}
self.onmessage = async event => {
  const { code, stdin, language, id } = event.data;
  try {
    if(language==='python') { self.postMessage({id,result:await runPython(code,stdin,id)});return; }
    if (!['c', 'cpp'].includes(language)) throw Error('Run은 C, C++, Python을 지원합니다.');
    if (!compilers.has(language)) {
      self.postMessage({ id, phase: '컴파일러 준비 중…' });
      const compiler = await createCompiler(language, { baseUrl: 'https://ok-oj-runtime.invalid/', std: language === 'c' ? 'gnu11' : 'gnu++14' });
      compilers.set(language, compiler);
    }
    self.postMessage({ id, phase: '컴파일 및 실행 중…' });
    const result = await compilers.get(language).run(code, stdin);
    result.runtime='Clang 22 · '+(language==='c'?'GNU C11':'GNU C++14');
    if ((result.output || '').length > 1_000_000) result.output = result.output.slice(0, 1_000_000) + '\n[출력 표시 제한]';
    self.postMessage({ id, result });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
