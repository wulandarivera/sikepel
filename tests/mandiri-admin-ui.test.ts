import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../src/lib/mandiri-ui';
const row = {id:'fixture-history',actor:'Petugas fixture',action:'ONLINE_REQUEST_NEEDS_REVISION',metadata:{revision_note:'Catatan fixture'},created_at:'2026-10-13T00:00:00Z'};
test('admin history uses existing riwayat response without duplicating aliases', () => {
 assert.equal(typeof ui.adminHistory,'function','adminHistory missing');
 assert.deepEqual(ui.adminHistory({riwayat:[row],status_riwayat:[row],audit_trail:[row]}),[row]);
});

test('completed requests cannot be edited', () => {
 assert.equal(typeof ui.adminCanEdit,'function','adminCanEdit missing');
 assert.equal(ui.adminCanEdit('COMPLETED'),false);
 assert.equal(ui.adminCanEdit('REJECTED'),false);
 assert.equal(ui.adminCanEdit('APPROVED'),true);
 assert.equal(ui.adminCanEdit('unknown'),false);
});

test('completed status without receipts exposes only unavailable delivery', () => {
 assert.equal(typeof ui.adminCommunication,'function','adminCommunication missing');
 assert.deepEqual(ui.adminCommunication({status:'COMPLETED'}),{delivery:'Bukti pengiriman WhatsApp belum tersedia',pickup:'Belum dikonfigurasi pada portal admin. Hubungi petugas untuk petunjuk resmi.'});
});

test('actual component wires history and truthful communication', async () => {
 const {readFile}=await import('node:fs/promises');
 const source=await readFile('src/components/permohonan-mandiri.tsx','utf8');
 for(const token of ['adminHistory(data)','adminCanEdit(status)','adminCommunication(data)','key: "COMPLETED"','Catatan perbaikan berhasil disimpan.','log.metadata?.revision_note','mandiri-edit-grid']) assert.ok(source.includes(token),token+' missing');
});
