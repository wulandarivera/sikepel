import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const luminance = (hex: string) => {
  const rgb = hex.match(/\w\w/g)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const source = (file: string) => readFileSync(new URL('../src/app/mandiri/' + file, import.meta.url), 'utf8');
test('tracking helper matches eight-character ticket pattern; timeline uses semantic text', () => {
  const page = source('lacak/page.tsx');
  assert.match(page, /Format: TIK-YYYYMM-XXXXXXXX</);
  assert.match(page, /pattern="TIK-\[0-9\]\{6\}-\[A-F0-9\]\{8\}"/);
  assert.ok(!page.includes('\u2713'));
  assert.match(page, /aria-current=\{view.step === i \? 'step'/);
  assert.match(page, /tahap selesai/);
});
test('form boundary tokens meet 3:1 against white and file-input background', () => {
  const css = source('portal.css');
  for (const token of ['control-border', 'control-border-hover', 'border-focus']) {
    const hex = css.match(new RegExp('--color-' + token + ': #(\\w{6})'))?.[1];
    assert.ok(hex, 'missing token: ' + token);
    for (const background of ['ffffff', 'f8fafc']) {
      assert.ok((luminance(background) + 0.05) / (luminance(hex) + 0.05) >= 3, token + ' contrast');
    }
  }
  assert.match(css, /border: 1.5px solid var\(--color-control-border\)/);
  assert.match(css, /textarea:focus-visible \{ outline: 3px solid/);
});
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
