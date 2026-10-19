import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeWaNotice as app} from '../src/lib/wa-notice';
import {safeWaNotice as gateway} from '../services/whatsapp-gateway/src/wa-notice';
import {formatTicketStatusReply} from '../services/whatsapp-gateway/src/formatters';
test('ready notifications include only explicitly configured official pickup fields with runtime parity',()=>{
 const keys=['WA_PICKUP_LOCATION','WA_PICKUP_HOURS','WA_PICKUP_DOCUMENTS'];
 const saved=keys.map(k=>process.env[k]);
 try {
 keys.forEach(k=>delete process.env[k]);
 const payload={ticket:'TIK-202610-ABCD1234',status:'SIAP_DIAMBIL'};
 assert.equal(app(payload),gateway(payload));
 assert.match(app(payload),/belum dikonfigurasi/i);
 assert.doesNotMatch(app(payload),/KTP|KK|08[.:]00|Kantor|Kelurahan Cibodas\. Periksa/);
 process.env.WA_PICKUP_LOCATION='Loket resmi fixture';process.env.WA_PICKUP_HOURS='Senin 09.00–11.00 WIB';process.env.WA_PICKUP_DOCUMENTS='Bukti tiket fixture';
 const result=app(payload);
 assert.equal(result,gateway(payload));assert.match(result,/Loket resmi fixture/);assert.match(result,/Senin 09.00–11.00 WIB/);assert.match(result,/Bukti tiket fixture/);
 assert.match(result,/Surat fisik/);assert.doesNotMatch(result,/https?:\/\/\S*\.pdf/i);
 assert.equal(result,app({...payload,status:'COMPLETED'}));
 const legacy=formatTicketStatusReply({ticket_code:payload.ticket,status:'COMPLETED',type_name:'PRIVATE_TYPE',resident_name:'PRIVATE_NAME',revision_note:'PRIVATE_NOTE'});
 assert.doesNotMatch(legacy,/PRIVATE|KTP/);
 } finally {keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});
