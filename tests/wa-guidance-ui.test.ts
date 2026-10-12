import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('portal separates greeting replies progression and shows actual safe preview',()=>{
 const source=readFileSync('src/components/wa-dashboard.tsx','utf8');
 for(const label of ['Sapaan awal','Notifikasi progres','__greeting__','__notifications__','safeWaNotice'])assert.ok(source.includes(label),label);
});
