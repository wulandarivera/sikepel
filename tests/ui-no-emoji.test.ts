import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(filename) : Promise.resolve(/\.(tsx?|css)$/.test(entry.name) ? [filename] : []);
  }));
  return groups.flat();
}

test('application source contains no emoji; plain copyright symbols remain allowed', async () => {
  const emoji = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;
  const violations: string[] = [];
  for (const filename of await sourceFiles(path.resolve('src'))) {
    const lines = (await readFile(filename, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      // Plain copyright, registered and trademark symbols are not emoji UI.
      if (emoji.test(line.replace(/[\u00A9\u00AE\u2122]/g, ''))) violations.push(`${path.relative(process.cwd(), filename)}:${index + 1}`);
    });
  }
  assert.deepEqual(violations, []);
});

test('template variable catalogue retains all five descriptive group headings', async () => {
  const source = await readFile('src/components/template-editor-modal.tsx', 'utf8');
  for (const label of ['Kelurahan & Kecamatan', 'Data Warga / Pemohon', 'Surat & Tanggal', 'Penandatangan', 'Field Spesifik {data?.type.name}']) {
    assert.ok(source.includes(label), `Missing catalogue heading: ${label}`);
  }
});
