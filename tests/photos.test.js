// Checks the photo catalogue: every selectable object has a photo, every file
// exists and every entry carries a caption, a credit and a free licence.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PHOTOS } from '../src/data/photos.js';
import { SUN, PLANETS, MOONS } from '../src/data/bodies.js';
import { COMETS } from '../src/data/comets.js';
import { SPACECRAFT } from '../src/data/spacecraft.js';

const ids = [SUN, ...PLANETS, ...MOONS, ...COMETS, ...SPACECRAFT].map((b) => b.id);
const FREE = /public domain|cc0|cc[ -]by/i;
let n = 0;
for (const id of ids) {
  const list = PHOTOS[id];
  assert.ok(list?.length, `no photo for ${id}`);
  for (const p of list) {
    n++;
    assert.ok(existsSync(new URL(`../${p.file}`, import.meta.url)), `missing file ${p.file}`);
    assert.ok(p.caption && p.credit && p.sourceUrl?.startsWith('https://commons.wikimedia.org/'), `incomplete metadata for ${p.file}`);
    assert.match(p.license, FREE, `non-free licence for ${p.file}`);
  }
}
const extra = Object.keys(PHOTOS).filter((k) => !ids.includes(k));
assert.deepEqual(extra, [], `photos for unknown ids: ${extra}`);
console.log(`ok   photos: ${ids.length} objects, ${n} images, all files present with credit and free licence`);
