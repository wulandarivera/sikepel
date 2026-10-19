'use strict';
const fs = require('node:fs');
const {parseEnv} = require('node:util');
const allowed = new Set(['DATABASE_URL','ALLOWED_ORIGINS','MANDIRI_VILLAGE_ID','WA_GATEWAY_URL','WA_GATEWAY_SECRET','WA_GATEWAY_VILLAGE_ID']);
function localDatabase(value) {
  try { const u = new URL(value); return ['postgres:','postgresql:'].includes(u.protocol) && ['localhost','127.0.0.1','[::1]'].includes(u.hostname) && u.pathname === '/sikepel'; } catch { return false; }
}
function prepare(text, config) {
  const values = parseEnv(text);
  if (Object.keys(values).some(k => !allowed.has(k))) throw new Error('unsupported environment key');
  const candidates = [];
  if (values.DATABASE_URL) candidates.push(values.DATABASE_URL);
  else for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*#\s*(DATABASE_URL\s*=.*)$/);
    if (match) { const value = parseEnv(match[1]).DATABASE_URL; if (localDatabase(value)) candidates.push(value); }
  }
  const unique = [...new Set(candidates)];
  if (unique.length !== 1 || !localDatabase(unique[0])) throw new Error('database selection rejected');
  values.DATABASE_URL = unique[0];
  const result = structuredClone(config);
  if (result.apps.length !== 1 || result.apps[0].name !== 'sikepel') throw new Error('unexpected process target');
  result.apps[0].env = {...values,...result.apps[0].env,DATABASE_URL:values.DATABASE_URL};
  return result;
}
module.exports = {prepare};
if (require.main === module) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--check') throw new Error('check mode required');
    const config = prepare(fs.readFileSync('/home/cibodas/apps/sikepel/.env','utf8'), require('./ecosystem.release.json'));
    const env = config.apps[0].env;
    const required = ['DATABASE_URL','ALLOWED_ORIGINS','MANDIRI_VILLAGE_ID','WA_GATEWAY_URL','WA_GATEWAY_SECRET','WA_GATEWAY_VILLAGE_ID'];
    if (required.some(k => !env[k])) throw new Error('required runtime key missing');
    console.log('PASS runtime secret presence and local database selection; values suppressed; no process start');
  } catch { console.error('FAIL runtime preparation validation; values suppressed'); process.exitCode = 1; }
}
