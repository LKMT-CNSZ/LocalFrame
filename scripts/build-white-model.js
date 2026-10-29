'use strict';
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
require('esbuild').buildSync({
  entryPoints: [path.join(__dirname, 'white-model/main.js')], bundle: true, minify: true,
  platform: 'browser', target: 'chrome138', format: 'iife', legalComments: 'eof',
  outfile: path.join(root, 'resources/h3-studio/app/public/white-model.bundle.js'),
});
fs.copyFileSync(path.join(root, 'node_modules/three/LICENSE'), path.join(root, 'resources/h3-studio/app/public/three-LICENSE.txt'));
