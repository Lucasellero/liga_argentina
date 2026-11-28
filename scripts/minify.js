#!/usr/bin/env node
// Minifica los JS de cada liga como parte del build de Vercel.
// No toca el código fuente en git: corre sobre el checkout efímero del build.
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const FILES = [
  'docs/liga_argentina/liga_argentina.js',
  'docs/liga_nacional/liga_nacional.js',
  'docs/liga_femenina/liga_femenina.js',
  'docs/liga_proximo/liga_proximo.js',
  'docs/argentina_formativas/argentina_formativas.js',
];

for (const file of FILES) {
  const abs = path.join(__dirname, '..', file);
  esbuild.buildSync({
    entryPoints: [abs],
    outfile: abs,
    allowOverwrite: true,
    minify: true,
    legalComments: 'none',
  });
  console.log('Minificado:', file);
}

// ── Versionado de JS/CSS ────────────────────────────────────────────────────
// vercel.json deja que el navegador reutilice los .js/.css hasta un día
// (stale-while-revalidate), pero el HTML se pide siempre. Sin esto, después de un
// deploy se mezcla HTML nuevo con JS viejo y la página se rompe. Cada referencia
// local queda como archivo.js?v=<hash del contenido>: la URL solo cambia cuando
// cambia el archivo, así los commits diarios de datos no invalidan la caché.
const DOCS = path.join(__dirname, '..', 'docs');
const ASSET_REF = /\b(src|href)="(?!https?:|\/\/|\/_vercel\/)([^"?#]+\.(?:js|css))"/g;

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

for (const html of htmlFiles(DOCS)) {
  let count = 0;
  const source = fs.readFileSync(html, 'utf8');
  const output = source.replace(ASSET_REF, (match, attr, ref) => {
    const target = ref.startsWith('/') ? path.join(DOCS, ref) : path.resolve(path.dirname(html), ref);
    // Si el archivo no existe, el build falla: es una referencia rota
    const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0, 10);
    count += 1;
    return `${attr}="${ref}?v=${hash}"`;
  });
  if (count) {
    fs.writeFileSync(html, output);
    console.log(`Versionados ${count} archivos en ${path.relative(DOCS, html)}`);
  }
}
