import hashlib,json,os,pathlib,signal,subprocess,time,urllib.request,socket
R=pathlib.Path('/fixture'); B=pathlib.Path('/usr/lib/postgresql/18/bin'); D=R/'pgdata'; S=R/'socket'; A=R/'app'
e={'status':'FAIL','steps':[]}; app=None
E={'PATH':'/usr/bin:/bin','HOME':'/fixture/home','LANG':'C','PGCONNECT_TIMEOUT':'5'}
def run(args,timeout=20):
 p=subprocess.run([str(a) for a in args],env=E,capture_output=True,text=True,timeout=timeout)
 e['steps'].append({'tool':pathlib.Path(str(args[0])).name,'exit':p.returncode})
 if p.returncode: (R/'private-error.log').write_text(p.stderr);raise RuntimeError('command failure')
 return p.stdout.strip()
def sql(q):return run([B/'psql','-X','-w','-h',S,'-p','55485','-U','cibodas','-d','sik06_fixture','-At','-v','ON_ERROR_STOP=1','-c',q])
def aggregates():
 return json.loads(sql("SELECT json_build_object('tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),'letters',(SELECT count(*) FROM letters),'residents',(SELECT count(*) FROM residents),'users',(SELECT count(*) FROM users),'online_requests',(SELECT count(*) FROM online_requests),'registry',(SELECT count(*) FROM draft_ticket_registry),'expired',(SELECT count(*) FROM letters WHERE status IN ('DRAFT','PREVIEW') AND draft_expires_at <= now()),'legacy',(SELECT count(*) FROM letters WHERE status IN ('DRAFT','PREVIEW') AND draft_ticket IS NULL));"))
def stop_app():
 global app
 if app:
  os.killpg(app.pid,signal.SIGTERM)
  try:app.wait(timeout=8)
  except subprocess.TimeoutExpired:os.killpg(app.pid,signal.SIGKILL);app.wait(timeout=3)
  app=None
def schema(label):
 text=run([B/'pg_dump','-h',S,'-p','55485','-U','cibodas','-d','sik06_fixture','--schema-only','--no-owner','--no-privileges'])
 text='\n'.join(l for l in text.splitlines() if not l.startswith(('\\restrict','\\unrestrict','--')) and l.strip())
 (R/(label+'-schema.sql')).write_text(text)
 return text

def focused(iteration):
 import secrets,http.cookiejar
 current=schema('startup'+str(iteration+1))
 previous=(R/('before-schema.sql' if iteration==0 else 'startup1-schema.sql')).read_text()
 import difflib
 diff='\n'.join(difflib.unified_diff(previous.splitlines(),current.splitlines(),fromfile='previous',tofile='current'))
 (R/('schema-diff-'+str(iteration+1)+'.txt')).write_text(diff)
 e.setdefault('schema',[]).append({'startup':iteration+1,'identical':previous==current,'before_sha256':hashlib.sha256(previous.encode()).hexdigest(),'after_sha256':hashlib.sha256(current.encode()).hexdigest(),'diff_lines':len(diff.splitlines())})
 if iteration==1:assert previous==current
 if iteration==0:
  password=secrets.token_hex(24);salt=secrets.token_hex(16)
  key=hashlib.scrypt(password.encode(),salt=salt.encode(),n=16384,r=8,p=1,dklen=64).hex()
  sql("INSERT INTO users(id,name,username,password_hash,role,active) VALUES('90900000-0000-4000-8000-999999999999','Synthetic SIK09','sik09.synthetic','"+salt+":"+key+"','SUPER_ADMIN',true)")
  jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
  req=urllib.request.Request('http://127.0.0.1:55486/api/login',data=json.dumps({'username':'sik09.synthetic','password':password}).encode(),headers={'Content-Type':'application/json','Origin':'http://127.0.0.1:55486'},method='POST')
  with opener.open(req,timeout=8) as response:assert response.status==200;response.read()
  with opener.open('http://127.0.0.1:55486/api/bootstrap',timeout=8) as response:
   assert response.status==200;payload=json.loads(response.read());assert payload['user']['username']=='sik09.synthetic';assert payload['local'] is False
  e['synthetic_http_auth']={'login':200,'bootstrap':200,'identity_assertion':True,'postgres_backend':True}
  del password,key,payload,jar,opener
 else:
  # Insert after startup; absence before first timer tick would indicate an unexpected path.
  sql("INSERT INTO letters(id,village_id,resident_id,type_id,status,created_by,draft_ticket,draft_expires_at) SELECT '90910000-0000-4000-8000-000000000001'::uuid,village_id,resident_id,type_id,'DRAFT',created_by,'SIK09-REAL-TIMER',now()+interval '2 seconds' FROM letters LIMIT 1")
  def count():return int(sql("SELECT count(*) FROM letters WHERE id='90910000-0000-4000-8000-000000000001'"))
  assert count()==1
  started=time.monotonic();polls=0;early_present=False
  while time.monotonic()-started<340:
   elapsed=time.monotonic()-started;remaining=count();polls+=1
   if elapsed>=5 and elapsed<270:assert remaining==1;early_present=True
   if remaining==0:break
   time.sleep(5)
  elapsed=time.monotonic()-started
  assert remaining==0 and early_present and elapsed>=280 and elapsed<=340
  e['actual_timer']={'configured_interval_ms':300000,'clock':'real monotonic wall elapsed; unmodified app timer','elapsed_seconds':round(elapsed,3),'polls':polls,'synthetic_before':1,'synthetic_after':0,'present_after_expiry_before_tick':early_present}
  stop_app()
  with (R/'private-boundary.log').open('wb') as output:
   child=subprocess.run(['/usr/bin/node','--import','tsx','sik09-boundary.ts'],cwd=A,env=ae,stdout=output,stderr=output,timeout=30)
  assert child.returncode==0
  e['boundaries']=json.loads((R/'boundary-evidence.json').read_text())

try:
 assert os.readlink('/proc/self/ns/net') != os.environ['SIK07_HOST_NETNS']
 assert not pathlib.Path('/home/cibodas/apps/sikepel').exists()
 assert run(['ip','route']) == ''
 probe=socket.socket();probe.settimeout(1)
 try:probe.connect(('100.67.16.86',3001));raise AssertionError('host gateway reachable')
 except OSError:pass
 finally:probe.close()
 assert not any(A.glob('.env*'))
 assert not list(A.rglob('.env'))
 assert not any(k in E for k in ['DATABASE_URL','WA_GATEWAY_SECRET','WA_GATEWAY_URL'])
 e['containment']={'distinct_network_namespace':True,'no_routes':True,'host_gateway_unreachable':True,'production_filesystem_hidden':True,'no_dotenv':True}
 with (D/'postgresql.conf').open('a') as f:f.write("\nlisten_addresses=''\nport=55485\nunix_socket_directories='/fixture/socket'\nunix_socket_permissions=0700\nshared_buffers='32MB'\nmax_connections=12\nmax_worker_processes=0\n")
 run([B/'pg_ctl','-D',D,'-l',R/'private-postgres.log','-w','-t','15','start'])
 assert run([B/'postgres','-D',D,'-C','listen_addresses']) == ''
 assert run([B/'postgres','-D',D,'-C','data_directory']) == str(D)
 assert '55485' not in run(['ss','-ltn'])
 assert sql("SELECT current_setting('data_directory')||'|'||current_setting('listen_addresses')") == '/fixture/pgdata|'
 schema('before')
 e['baseline']=aggregates()
 # Synthetic copies use existing foreign keys; no source row values leave SQL.
 sql("INSERT INTO letters(id,village_id,resident_id,type_id,status,created_by,draft_ticket,draft_expires_at) SELECT ('70700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,l.village_id,l.resident_id,l.type_id,CASE n WHEN 2 THEN 'PREVIEW' WHEN 5 THEN 'ISSUED' ELSE 'DRAFT' END,l.created_by,CASE WHEN n=4 THEN NULL ELSE 'SIK07-'||n END,CASE WHEN n=3 THEN now()+interval '1 hour' ELSE now()-interval '1 hour' END FROM (SELECT * FROM letters LIMIT 1) l CROSS JOIN generate_series(1,5) n;")
 legacy_expired=int(sql("SELECT count(*) FROM letters WHERE status IN ('DRAFT','PREVIEW') AND draft_ticket IS NULL AND draft_expires_at <= now()"));e['legacy_expired_reassigned']=legacy_expired
 before=aggregates();assert before['letters']==e['baseline']['letters']+5;e['before_start']=before
 # Child environment is built from scratch; Next cannot find production dotenv.
 ae={**E,'NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1','SIKEPEL_DATA_DIR':'/fixture/storage','DATABASE_URL':'postgresql://cibodas@localhost/sik06_fixture?host=%2Ffixture%2Fsocket&port=55485','ALLOWED_ORIGINS':'http://127.0.0.1:55486'}
 e['runtime_version']=json.loads((A/'package.json').read_text())['version'];e['build_id']=(A/'.next/BUILD_ID').read_text().strip()
 e['startup_runs']=[]
 for iteration in range(2):
  log=(R/f'private-app-{iteration+1}.log').open('wb')
  app=subprocess.Popen(['/usr/bin/node','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','55486'],cwd=A,env=ae,stdout=log,stderr=log,start_new_session=True)
  statuses={};deadline=time.monotonic()+25
  while time.monotonic()<deadline:
   if app.poll() is not None:raise RuntimeError('app exited')
   try:
    with urllib.request.urlopen('http://127.0.0.1:55486/login',timeout=2) as response: statuses['login']=response.status;response.read()
    if statuses['login']==200:break
   except Exception:time.sleep(.3)
  assert statuses.get('login')==200
  try:
   with urllib.request.urlopen('http://127.0.0.1:55486/api/bootstrap',timeout=3) as response:statuses['bootstrap_unauthenticated']=response.status;response.read()
  except urllib.error.HTTPError as ex:statuses['bootstrap_unauthenticated']=ex.code;ex.close()
  assert statuses['bootstrap_unauthenticated'] in [401,403]
  after=aggregates();e['last_observed']=after;e['last_http_status']=statuses
  if iteration==0:
   assert after['letters']==before['letters']-before['expired']+legacy_expired
   assert after['legacy']==0 and after['expired']==0
   assert int(sql("SELECT count(*) FROM letters WHERE id IN ('70700000-0000-4000-8000-000000000003','70700000-0000-4000-8000-000000000004','70700000-0000-4000-8000-000000000005')"))==3
   assert int(sql("SELECT count(*) FROM letters WHERE id IN ('70700000-0000-4000-8000-000000000001','70700000-0000-4000-8000-000000000002')"))==0
  else:assert all(after[k]==e['startup_runs'][0]['aggregates'][k] for k in ['letters','residents','online_requests','registry','expired','legacy'])
  e['startup_runs'].append({'iteration':iteration+1,'http_status':statuses,'aggregates':after})
  focused(iteration)
  stop_app();log.close()
 assert all(e['baseline'][k]==after[k] for k in ['tables','residents','online_requests'])
 e['status']='PASS'
except BaseException as ex:e['error_type']=type(ex).__name__
finally:
 try:stop_app()
 except BaseException:e['app_stop_failed']=True;e['status']='FAIL'
 if (D/'postmaster.pid').exists():
  try:run([B/'pg_ctl','-D',D,'-m','immediate','-w','-t','15','stop'])
  except BaseException:e['pg_stop_failed']=True;e['status']='FAIL'
 e['stopped']=not (D/'postmaster.pid').exists() and not (S/'.s.PGSQL.55485').exists()
 try:e['no_fixture_listeners']=not any(p in run(['ss','-ltn']) for p in [':55485',':55486'])
 except BaseException:e['no_fixture_listeners']=False
 if not e['stopped'] or not e['no_fixture_listeners']:e['status']='FAIL'
 (R/'runtime-evidence.json').write_text(json.dumps(e,indent=2)+'\n')
 print(json.dumps(e),flush=True)
raise SystemExit(0 if e['status']=='PASS' else 1)
