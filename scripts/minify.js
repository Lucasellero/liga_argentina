#!/usr/bin/env node
// Minifica los JS de cada liga como parte del build de Vercel.
// No toca el código fuente en git: corre sobre el checkout efímero del build.
const esbuild = require('esbuild');
const path = require('path');

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
