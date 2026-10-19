'use strict';
const assert = require('node:assert/strict');
const {collect, sanitizeError} = require('./qa-readonly-aggregates.cjs');
(async () => {
 const calls=[];
 const client={connect:async()=>calls.push('connect'),query:async(q)=>{calls.push(q); if(q.startsWith('SHOW')) return {rows:[{transaction_read_only:'on'}]}; return {rows:[{residents:1}]};},end:async()=>calls.push('end')};
 const result=await collect(client);
 assert.equal(result.residents,1);
 assert.ok(calls.includes('BEGIN READ ONLY'));
 assert.deepEqual(calls.slice(-2),['ROLLBACK','end']);
 const failed=[];
 const bad={connect:async()=>{},query:async(q)=>{failed.push(q);if(q==='ROLLBACK')return {};throw Object.assign(new Error('private connection information'),{code:'28P01'});},end:async()=>failed.push('end')};
 await assert.rejects(collect(bad));
 assert.deepEqual(failed.slice(-2),['ROLLBACK','end']);
 assert.deepEqual(sanitizeError({code:'28P01',message:'private'}),{code:'28P01',class:'authentication',action:'Check approved loader credentials; do not print them.'});
 assert.equal(JSON.stringify(sanitizeError({code:'private-url',message:'private'})).includes('private'),false);
 console.log('PASS read-only transaction, rollback/end success/failure, sanitized errors');
})().catch(()=>{console.error('FAIL aggregate helper contract');process.exitCode=1;});
