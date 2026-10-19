#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sql = `SELECT
 (SELECT count(*)::int FROM residents) AS residents,
 (SELECT count(*)::int FROM users) AS users,
 (SELECT count(*)::int FROM online_requests) AS online_requests,
 (SELECT count(*)::int FROM letters) AS letters,
 (SELECT count(*)::int FROM letters WHERE status IN ('DRAFT','PREVIEW') AND draft_expires_at<=now()) AS expired_drafts,
 (SELECT count(*)::int FROM draft_ticket_registry) AS registry,
 (SELECT count(*)::int FROM draft_ticket_registry WHERE expired_at IS NOT NULL) AS registry_expired`;
function sanitizeError(error) {
 const code = /^[A-Z0-9_]{2,24}$/.test(error?.code || '') ? error.code : 'UNCLASSIFIED';
 if (code === '28P01' || code === '28000') return {code, class:'authentication', action:'Check approved loader credentials; do not print them.'};
 if (['ECONNREFUSED','ENOTFOUND','ETIMEDOUT','EHOSTUNREACH'].includes(code)) return {code,class:'connection',action:'Check local PostgreSQL listener and approved loader host/port.'};
 if (code === '57014') return {code,class:'timeout',action:'Check PostgreSQL load; statement timeout reached.'};
 if (code === '42501') return {code,class:'permission',action:'Check aggregate SELECT privileges for approved role.'};
 return {code,class:'query_or_configuration',action:'Check approved loader, installed pg dependency, and schema; never dump raw error.'};
}
async function collect(client) {
 let connected=false;
 try {
  await client.connect(); connected=true;
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '5000ms'");
  await client.query("SET LOCAL lock_timeout = '2000ms'");
  const check=await client.query('SHOW transaction_read_only');
  if (check.rows[0].transaction_read_only !== 'on') throw Object.assign(new Error(),{code:'READ_ONLY_REQUIRED'});
  return (await client.query(sql)).rows[0];
 } finally {
  try { if (connected) await client.query('ROLLBACK'); }
  finally { await client.end(); }
 }
}
module.exports={collect,sanitizeError};
if (require.main === module) {
 (async()=>{
  process.umask(0o077);
  if (process.argv.length!==2) {console.error('Usage: node qa-readonly-aggregates.cjs');process.exitCode=2;return;}
  let evidence={task:'SIK-13',timestamp:new Date().toISOString(),status:'FAIL',connection_source:'approved ecosystem.private.config.cjs loader; no PM2 access',transaction:'BEGIN READ ONLY; ROLLBACK finally; client.end finally'};
  try {
   const config=require('./ecosystem.private.config.cjs');
   const app=config.apps[0];
   const {createRequire}=require('node:module');
   const {Client}=createRequire(path.join(app.cwd,'package.json'))('pg');
   const client=new Client({connectionString:app.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000,application_name:'sikepel_qa_readonly_aggregates',options:'-c default_transaction_read_only=on'});
   client.on('error',()=>{});
   evidence.counts=await collect(client);evidence.status='PASS';
  } catch(error) {evidence.error=sanitizeError(error);process.exitCode=1;}
  const dir=fs.mkdtempSync(path.join(path.dirname(__dirname),'sik13-aggregate-'));
  fs.chmodSync(dir,0o700);
  const file=path.join(dir,'evidence.json');const body=JSON.stringify(evidence,null,2)+'\n';
  fs.writeFileSync(file,body,{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({...evidence,evidence:file,sha256:crypto.createHash('sha256').update(body).digest('hex')}));
 })().catch(()=>{console.error('FAIL protected evidence creation; no raw error emitted');process.exitCode=1;});
}
