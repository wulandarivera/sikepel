import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file: string) => readFileSync(new URL('../src/app/mandiri/' + file, import.meta.url), 'utf8');
test('redesign styles every primary portal component with scoped tokens', () => {
  const css = source('portal.css');
  for (const name of ['portal-brand-badge', 'portal-brand-text', 'portal-hero', 'portal-cards', 'portal-card', 'stepper', 'stepper-item', 'receipt-card', 'receipt-ticket', 'receipt-token-box', 'timeline']) {
    assert.ok(css.includes('.portal .' + name), 'missing style: ' + name);
  }
  assert.ok(!css.includes(':root'), 'portal tokens must not leak into operator UI');
  assert.match(css, /prefers-reduced-motion/);
});
test('receipt and tracking explain bearer privacy and physical-only service', () => {
  for (const file of ['ajukan/page.tsx', 'lacak/page.tsx']) {
    assert.match(source(file), /Siapa pun.*kode akses.*melacak/);
    assert.match(source(file), /bukan bukti.*diterbitkan/);
    assert.match(source(file), /PDF.*tidak tersedia/);
  }
  assert.ok(!source('page.tsx').includes('untuk menerima instruksi'));
});
