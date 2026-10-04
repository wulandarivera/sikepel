import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require.extensions['.css']=(module)=>{module.exports={__esModule:true,default:new Proxy({}, {get:(_target,key)=>String(key)})};};
test('Indonesian wizard includes token, identity and all three password fields',async()=>{
 const mod=await import('../src/components/setup-wizard').catch(()=>null);
 assert.ok(mod,'setup wizard must exist');
 const html=renderToStaticMarkup(createElement(mod.SetupWizard));
 for(const label of ['Super Admin','Admin Kelurahan','Operator Kelurahan','Token penyiapan','Kecamatan','Provinsi']) assert.ok(html.includes(label),label);
 assert.equal((html.match(/type="password"/g)||[]).length,7);
});
