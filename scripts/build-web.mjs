// Assembles the playable game into www/, the folder Capacitor packs into the Android app.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const item of ['index.html', 'css', 'js', 'vendor', 'icons', 'manifest.webmanifest', 'sw.js']) {
  cpSync(item, `www/${item}`, { recursive: true });
}
console.log('www ready');
