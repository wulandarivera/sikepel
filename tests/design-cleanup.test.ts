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
  assert.match(read('src/lib/version.ts'), /appPackage.version/);
});

test('identity instructions explain check then continue without changing gate', () => {
  const form = read('src/app/mandiri/ajukan/page.tsx');
  assert.match(form, /Masukkan NIK 16 digit dan tanggal lahir sesuai KTP/);
  assert.match(form, /Lanjut aktif setelah pemeriksaan NIK selesai/);
  assert.match(form, /aria-describedby="identity-next-help"/);
  assert.match(form, /disabled=\{!checked\}/);
});

test('WA tabs expose selected state and override generic button styles', () => {
  const view = read('src/components/wa-dashboard.tsx');
  assert.match(view, /aria-selected=\{activeTab === "status"\}/);
  assert.match(view, /aria-selected=\{activeTab === "replies"\}/);
  assert.match(read('src/app/wa/wa.css'), /\.wa-shell \.wa-tab-active/);
});

test('WA pairing title follows connection and logout lives in separate danger area', () => {
  const view = read('src/components/wa-dashboard.tsx');
  assert.match(view, /status\?\.connected \? "Perangkat terhubung" : "Hubungkan perangkat"/);
  assert.match(view, /className="wa-card wa-danger-zone"/);
  assert.match(view, /aria-labelledby="wa-session-danger"/);
  assert.match(view, /action\("logout", \{ confirm: true \}\)/);
  assert.match(view, /APP_VERSION/);
});
