import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(p, 'utf8');
test('home offers independent apply and tracking with actual credentials', () => {
  const home = read('src/app/mandiri/page.tsx');
  assert.match(home, /nomor tiket dan tanggal lahir pemohon/);
  assert.doesNotMatch(home, /Langkah [12]|kode akses rahasia/);
  assert.match(home, /href="\/mandiri\/ajukan"/);
  assert.match(home, /href="\/mandiri\/lacak"/);
});
test('hero stays compact and footer uses central app version', () => {
  assert.match(read('src/app/mandiri/portal.css'), /max-width: 96px/);
  assert.match(read('src/app/mandiri/layout.tsx'), /APP_VERSION/);
  assert.match(read('package.json'), /"version": "0.5.6"/);
});
