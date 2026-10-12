import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getAutoReplyStore} from '../src/auto-replies.js';
import {processMessageText,handleIncomingMessage} from '../src/bot.js';
import {config} from '../src/config.js';
test('reserved greeting setting controls preview text and enabled state',async()=>{
 config.sessionDir=await (await import('node:fs/promises')).mkdtemp('/tmp/wa-settings-fixture-');
 const store=getAutoReplyStore();await store.init();
 const entry=await store.create({keyword:'__greeting__',match_type:'EXACT',reply_text:'Sapaan fixture. Portal https://mandiri.sikepel.biz.id',is_active:true});
 assert.equal(await processMessageText('halo'),entry.reply_text);
 await store.update(entry.id,{is_active:false});
 assert.equal(await processMessageText('halo'),null);
});
