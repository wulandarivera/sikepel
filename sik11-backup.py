import os,pathlib,subprocess,json,hashlib,gzip,tarfile,datetime,shutil
os.umask(0o077)
B=pathlib.Path('/home/cibodas/apps/sikepel');P=B/'runtime-preflight/sik04-pm2-json-preparation'
root=pathlib.Path('/home/cibodas/backups')/('sik11-'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
root.mkdir(mode=0o700);e={'handle':str(root),'status':'FAIL','owner_cleanup_scope':'Normal expired DRAFT/PREVIEW cleanup during later recovery only; no deletion or cutover now.'}
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(1048576),b''):h.update(block)
 return h.hexdigest()
def command(args,**kw):
 with (root/'private-tools.log').open('ab') as log:
  x=subprocess.run(args,stdout=log,stderr=log,timeout=120,**kw)
 return x.returncode
try:
 # Independent command statuses provide pipefail semantics without shell pipelines.
 partial=root/'database.dump.gz.partial';env={k:v for k,v in os.environ.items() if k in ['PATH','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGCONNECT_TIMEOUT']}
 env['PGOPTIONS']='-c default_transaction_read_only=on'
 with partial.open('wb') as out,(root/'private-dump.log').open('wb') as log:
  producer=subprocess.Popen(['/usr/lib/postgresql/18/bin/pg_dump','-Fc','--no-password'],env=env,stdout=subprocess.PIPE,stderr=log)
  try:
   consumer=subprocess.Popen(['gzip','-c'],stdin=producer.stdout,stdout=out,stderr=log);producer.stdout.close()
   c=consumer.wait(timeout=120);a=producer.wait(timeout=10)
  finally:
   for proc in [producer,locals().get('consumer')]:
    if proc and proc.poll() is None:proc.kill();proc.wait()
 e['dump_exit']=a;e['compression_exit']=c;assert a==0 and c==0
 e['gzip_verify_exit']=command(['gzip','-t',str(partial)]);assert e['gzip_verify_exit']==0
 with (root/'private-catalog.log').open('wb') as log:
  g=subprocess.Popen(['gzip','-dc',str(partial)],stdout=subprocess.PIPE,stderr=log)
  x=subprocess.run(['/usr/lib/postgresql/18/bin/pg_restore','--list'],stdin=g.stdout,stdout=log,stderr=log,timeout=30);g.stdout.close();gr=g.wait(timeout=5)
 e['catalog_exit']=x.returncode;e['catalog_gzip_exit']=gr;assert x.returncode==0 and gr==0
 partial.rename(root/'database.dump.gz');e['database_sha256']=sha(root/'database.dump.gz')
 q="SELECT json_build_object('tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),'residents',(SELECT count(*) FROM residents),'letters',(SELECT count(*) FROM letters),'users',(SELECT count(*) FROM users),'online_requests',(SELECT count(*) FROM online_requests),'expired',(SELECT count(*) FROM letters WHERE status IN ('DRAFT','PREVIEW') AND draft_expires_at<=now()))"
 x=subprocess.run(['/usr/lib/postgresql/18/bin/psql','-X','-w','-At','-v','ON_ERROR_STOP=1','-c',q],env=env,capture_output=True,text=True,timeout=10);assert x.returncode==0;e['live_aggregate_observation']=json.loads(x.stdout)
 # Copy required secret configuration server-locally, never expose it in evidence or Git.
 secret=root/'private-config';secret.mkdir(mode=0o700)
 shutil.copyfile(B/'.env',secret/'root.env');(secret/'root.env').chmod(0o600)
 for n in ['ecosystem.release.json','ecosystem.private.config.cjs','release-launcher.cjs']:
  shutil.copyfile(P/n,secret/n);(secret/n).chmod(0o600)
 e['private_config_files']=4
 # Do not read WA/session contents. Preserve application storage tree only.
 e['storage_consistency']='No atomic DB/filesystem snapshot; app currently not running Next. tar detects changes but does not prove cross-resource consistency.'
 temp=root/'runtime-storage.tar.gz.partial'
 with tarfile.open(temp,'w:gz',dereference=False) as archive:archive.add(B/'.data',arcname='data',recursive=True)
 with tarfile.open(temp,'r:gz') as archive:e['storage_members']=sum(1 for _ in archive)
 temp.rename(root/'runtime-storage.tar.gz');e['storage_sha256']=sha(root/'runtime-storage.tar.gz')
 x=subprocess.run(['pm2','jlist'],capture_output=True,text=True,timeout=15);assert x.returncode==0
 rows=json.loads(x.stdout);sanitized=[{'pm_id':r.get('pm_id'),'name':r.get('name'),'exec':r.get('pm2_env',{}).get('pm_exec_path'),'cwd':r.get('pm2_env',{}).get('pm_cwd'),'status':r.get('pm2_env',{}).get('status')} for r in rows if r.get('name') in ['ecosystem.release','sikepel','sikepel-wa-gateway']]
 (root/'pm2-sanitized.json').write_text(json.dumps(sanitized,indent=2));e['pm2_metadata_sha256']=sha(root/'pm2-sanitized.json')
 e['wa_backup']='NOT performed: gateway online; consistent live session backup not established. Gateway/session untouched.'
 e['status']='PASS_BACKUP_VALIDATION_PENDING_RESTORE_QA'
except BaseException as ex:e['error_type']=type(ex).__name__
finally:
 (root/'backup-evidence.json').write_text(json.dumps(e,indent=2));print(json.dumps(e),flush=True)
raise SystemExit(0 if e['status'].startswith('PASS') else 1)
