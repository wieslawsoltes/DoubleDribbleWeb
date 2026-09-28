import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This zero-dependency bundler is intentionally limited to this project's named,
// relative ES-module imports. Duplicate module-scope identifiers are caught by
// parsing the resulting classic script in the build and browser tests.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const seen=new Set(),chunks=[];
async function visit(filename){
  filename=path.resolve(filename);if(seen.has(filename))return;seen.add(filename);
  let source=await readFile(filename,'utf8');
  const imports=[...source.matchAll(/^import\s+[^;]+?\s+from\s+['"]([^'"]+)['"];?\s*$/gm)];
  for(const found of imports){if(!found[1].startsWith('.'))throw new Error(`External dependency not supported: ${found[1]}`);await visit(path.resolve(path.dirname(filename),found[1]));}
  source=source.replace(/^import\s+[^;]+?\s+from\s+['"][^'"]+['"];?\s*$/gm,'').replace(/^export\s+(?=(?:class|function|const|let|var)\b)/gm,'');
  chunks.push(`\n/* ${path.relative(root,filename).replaceAll('\\','/')} */\n${source}`);
}
await visit(path.join(root,'src/main.js'));
const bundle=`(()=>{\n'use strict';\n${chunks.join('\n')}\n})();`;
new Function(bundle); // Syntax-only validation; never executes browser code here.
let html=await readFile(path.join(root,'index.html'),'utf8');
const css=await readFile(path.join(root,'styles.css'),'utf8');
html=html.replace('<link rel="stylesheet" href="styles.css">',`<style>\n${css}\n</style>`)
 .replace('<script type="module" src="src/main.js"></script>',`<script>\n${bundle.replaceAll('</script','<\\/script')}\n</script>`);
await mkdir(path.join(root,'dist'),{recursive:true});
await writeFile(path.join(root,'dist/index.html'),html);
await writeFile(path.join(root,'dist/double-dribble.html'),html);
await writeFile(path.join(root,'dist/.nojekyll'),'');
await writeFile(path.join(root,'dist/build-info.json'),JSON.stringify({version:'0.1.0',sourceCommit:process.env.GITHUB_SHA||null,htmlSha256:(await import('node:crypto')).createHash('sha256').update(html).digest('hex')},null,2)+'\n');
console.log(`Built standalone game: ${(Buffer.byteLength(html)/1024).toFixed(1)} KiB, ${seen.size} modules, no external requests.`);
