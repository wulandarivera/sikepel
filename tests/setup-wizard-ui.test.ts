import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getSetupStepError} from '../src/components/setup-validation';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require.extensions['.css']=(module)=>{module.exports={__esModule:true,default:new Proxy({}, {get:(_target,key)=>String(key)})};};
const {SetupWizard}=require('../src/components/setup-wizard');
test('onboarding presents four stages and secondary token instructions',()=>{
 const html=renderToStaticMarkup(React.createElement(SetupWizard));
 assert.match(html,/Tinjau &amp; aktifkan/);assert.match(html,/<details/);assert.match(html,/aria-current="step"/);
});
test('password confirmation must match before advancing',()=>{
 const data=new FormData();data.set('superAdmin.password','a-long-password');data.set('superAdmin.confirm','different');
 assert.equal(getSetupStepError(data,1),'Konfirmasi kata sandi Super Admin belum sesuai.');
 data.set('superAdmin.confirm','a-long-password');assert.equal(getSetupStepError(data,1),'');
});
test('kelurahan account confirmations are checked independently',()=>{
 const data=new FormData();data.set('admin.password','long-password');data.set('admin.confirm','long-password');data.set('operator.password','another-password');data.set('operator.confirm','wrong');
 assert.equal(getSetupStepError(data,3),'Konfirmasi kata sandi Operator Kelurahan belum sesuai.');
});

