import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentError, statusView } from '../src/lib/mandiri-ui';
import { proxy } from '../src/proxy';
import { NextRequest } from 'next/server';

test('mandiri root rewrites without opening administrative pages', () => {
  const root = proxy(new NextRequest('https://mandiri.sikepel.biz.id/'));
  assert.equal(root.headers.get('x-middleware-rewrite'), 'https://mandiri.sikepel.biz.id/mandiri');
  for (const route of ['/login', '/app', '/api/bootstrap']) assert.equal(proxy(new NextRequest('https://mandiri.sikepel.biz.id'+route)).status,404);
  for (const asset of ['/assets/icon.webp', '/assets/logo.webp']) assert.equal(proxy(new NextRequest('https://mandiri.sikepel.biz.id'+asset)).status,200);
  assert.equal(proxy(new NextRequest('https://sikepel.biz.id/')).headers.get('x-middleware-rewrite'),null);
});
test('status labels do not fabricate signing or pickup readiness', () => {
  assert.equal(statusView('APPROVED').label, 'Disetujui');
  assert.equal(statusView('COMPLETED').label, 'Selesai');
  assert.equal(statusView('NEEDS_REVISION').step,1);
  assert.equal(statusView('unknown').step,-1);
});
test('attachment validation matches server limits', () => {
  const pdf={size:100,type:'application/pdf'};
  assert.equal(attachmentError([pdf]),'');
  assert.match(attachmentError([pdf,pdf,pdf,pdf]),/tiga/);
  assert.match(attachmentError([{size:2097153,type:'image/png'}]),/2 MB/);
  assert.match(attachmentError([{size:1,type:'text/html'}]),/PDF/);
  assert.match(attachmentError([{size:0,type:'image/png'}]),/kosong/);
});
