import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processMessageText} from '../src/bot.js';
test('pickup without official configuration does not invent hours location or documents',async()=>{
 const text=await processMessageText('pengambilan surat');
 assert.match(text!,/pengambilan belum dikonfigurasi/i);
 assert.match(text!,/surat fisik/i);
 assert.doesNotMatch(text!,/KTP|KK|08[.:]00|No\. 1|24 jam/);
});
test('pickup includes operator configured official instructions',async()=>{
 process.env.WA_PICKUP_LOCATION='Loket fixture resmi';
 process.env.WA_PICKUP_HOURS='Senin 09.00–11.00 WIB';
 process.env.WA_PICKUP_DOCUMENTS='Bukti tiket fixture';
 try {
  const text=await processMessageText('pengambilan surat');
  assert.match(text!,/Loket fixture resmi/);
  assert.match(text!,/Senin 09.00–11.00 WIB/);
  assert.match(text!,/Bukti tiket fixture/);
 } finally {
  delete process.env.WA_PICKUP_LOCATION;delete process.env.WA_PICKUP_HOURS;delete process.env.WA_PICKUP_DOCUMENTS;
 }
});
