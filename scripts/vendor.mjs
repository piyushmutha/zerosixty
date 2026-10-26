// Copies the 3D engine and the two typefaces out of node_modules so the game runs with no network.
import { cpSync, mkdirSync } from 'node:fs';

const fonts = [
  ['overpass', 'latin-400-normal'], ['overpass', 'latin-600-normal'], ['overpass', 'latin-800-normal'],
  ['overpass', 'latin-900-normal'], ['overpass', 'latin-600-italic'],
  ['kalam', 'latin-400-normal'], ['kalam', 'latin-700-normal'],
];
mkdirSync('vendor/fonts', { recursive: true });
cpSync('node_modules/three/build/three.min.js', 'vendor/three.min.js');
cpSync('node_modules/three/LICENSE', 'vendor/three-LICENSE.txt');
for (const [family, file] of fonts) cpSync(`node_modules/@fontsource/${family}/files/${family}-${file}.woff2`, `vendor/fonts/${family}-${file}.woff2`);
cpSync('node_modules/@fontsource/overpass/LICENSE', 'vendor/fonts/Overpass-OFL.txt');
cpSync('node_modules/@fontsource/kalam/LICENSE', 'vendor/fonts/Kalam-OFL.txt');
console.log('vendor ready');
