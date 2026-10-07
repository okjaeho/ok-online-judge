import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),app=path.join(root,'extension/app');
await mkdir(app,{recursive:true});
const common={bundle:true,minify:true,format:'esm',platform:'browser',target:['chrome120'],legalComments:'linked',logLevel:'info'};
await build({...common,entryPoints:[path.join(root,'src/app.js')],outfile:path.join(app,'bundle.js'),loader:{'.ttf':'file'},assetNames:'[name]-[hash]'});
await build({...common,entryPoints:[path.join(root,'node_modules/monaco-editor/esm/vs/editor/editor.worker.js')],outfile:path.join(app,'editor.worker.js')});
await cp(path.join(root,'node_modules/pdfjs-dist/build/pdf.worker.mjs'),path.join(app,'pdf.worker.mjs'));
for(const folder of ['cmaps','standard_fonts','wasm'])await cp(path.join(root,'node_modules/pdfjs-dist',folder),path.join(app,'pdf',folder),{recursive:true});
await build({...common,format:'iife',external:['node:*','ws'],entryPoints:[path.join(root,'src/run.worker.js')],outfile:path.join(app,'run.worker.js'),plugins:[{
  name:'bound-program-output',setup(build){
    build.onLoad({filter:/[/\\]clang-wasm[/\\]src[/\\]compile\.js$/},async args=>{
      let contents=await readFile(args.path,'utf8');
      if(!contents.includes('const order = [];')||!contents.includes('order.push(chunk);'))throw Error('Compiler output guard needs review for this package version.');
      contents=contents.replace('const order = [];','const order = []; let outputLength = 0;').replaceAll('order.push(chunk);','outputLength += chunk.length; if (outputLength > 1000000) throw new Error("출력량이 1MB를 넘어 실행을 중지했습니다."); order.push(chunk);');
      return {contents,loader:'js'};
    });
  }
}]});
const compiler=path.join(root,'node_modules/@live-codes/clang-wasm');
await mkdir(path.join(app,'clang/bin'),{recursive:true});
await cp(path.join(compiler,'assets/runtime-manifest.v1.json'),path.join(app,'clang/runtime-manifest.v1.json'));
for(const file of ['memfs.wasm.gz','clang.wasm.gz','lld.wasm.gz','sysroot.tar.gz'])await cp(path.join(compiler,'assets/bin',file),path.join(app,'clang/bin',file));
await mkdir(path.join(app,'licenses'),{recursive:true});
await mkdir(path.join(app,'pyodide'),{recursive:true});
for(const file of ['pyodide.asm.js','pyodide.asm.wasm','pyodide-lock.json','python_stdlib.zip'])await cp(path.join(root,'node_modules/pyodide',file),path.join(app,'pyodide',file));
for(const [source,destination] of [['pdfjs-dist/LICENSE','pdfjs.txt'],['monaco-editor/LICENSE','monaco.txt'],['dompurify/LICENSE','dompurify.txt'],['@live-codes/clang-wasm/THIRD-PARTY-NOTICES.md','clang-notices.md'],['@bjorn3/browser_wasi_shim/LICENSE-MIT','wasi.txt'],['@wasm-idle/llvm-core/LICENSE.llvm.txt','llvm.txt']]){
  await cp(path.join(root,'node_modules',source),path.join(app,'licenses',destination));
}
await cp(path.join(root,'vendor-licenses'),path.join(app,'licenses'),{recursive:true});
await writeFile(path.join(app,'licenses/README.txt'),'This distribution includes Monaco Editor, DOMPurify, @live-codes/clang-wasm, @wasm-idle/llvm-core, browser_wasi_shim and Pyodide. License notices are included here and in the *.LEGAL.txt files. The compiler bundle adds a 1 MB program output limit. Pyodide 0.29.3 source: https://github.com/pyodide/pyodide/tree/0.29.3 (MPL-2.0), CPython source: https://github.com/python/cpython/tree/v3.13.2. The unmodified pyodide.asm.js and packaged standard library are included under app/pyodide.\n');
console.log('Extension build complete.');
