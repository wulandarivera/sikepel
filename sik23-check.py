import pathlib, subprocess,json,os,tempfile,fcntl,hashlib
p=pathlib.Path('/home/cibodas/apps/sikepel/runtime-preflight/sik23-preservation')
lock=(p.parent/'sik16-check.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
r=pathlib.Path(tempfile.mkdtemp(prefix='sik16-check-',dir=p.parent));os.chmod(r,0o700)
# No production directories, home, environment or network visible inside fixture.
cmd=['bwrap','--die-with-parent','--unshare-net','--unshare-pid','--unshare-ipc','--unshare-uts','--ro-bind','/usr','/usr','--ro-bind','/bin','/bin','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--tmpfs','/home','--ro-bind','/etc','/etc','--ro-bind','/opt/google/chrome','/opt/google/chrome','--ro-bind','/home/cibodas/apps/sikepel/runtime-preflight/sik08-typecheck-h1amhajg/lo-runtime','/lo','--bind',str(p),'/candidate','--ro-bind','/home/cibodas/apps/sikepel/releases/e968338a106d672f0a7682d456a82567aadd080e/node_modules','/candidate/node_modules','--ro-bind','/home/cibodas/apps/sikepel/services/whatsapp-gateway/node_modules','/candidate/services/whatsapp-gateway/node_modules','--clearenv','--setenv','PATH','/usr/bin:/bin','--setenv','HOME','/tmp','--setenv','SIKEPEL_DATA_DIR','/tmp/fixture-data','--setenv','WA_SESSION_DIR','/tmp/fixture-session','--setenv','WA_GATEWAY_SECRET','fixture-only','--setenv','SIKEPEL_INTERNAL_URL','http://127.0.0.1:1','--setenv','NEXT_TELEMETRY_DISABLED','1','--setenv','LIBREOFFICE_PATH','/lo/usr/lib/libreoffice/program/soffice','--setenv','LD_LIBRARY_PATH','/lo/usr/lib/libreoffice/program:/lo/usr/lib/x86_64-linux-gnu','--setenv','LIBLANGTAG_DATA','/lo/usr/share/liblangtag','--chdir','/candidate']
commands=json.loads(os.environ.get("SIK16_COMMANDS",'[["npm", "run", "wa:build"], ["node", "sik23-http.mjs"], ["node", "--test", "sik23-session.test.mjs"], ["env", "SIK23_BUILT=1", "node", "--test", "sik23-session.test.mjs"], ["npm", "run", "wa:test"], ["node", "node_modules/typescript/bin/tsc", "--noEmit"], ["npm", "test"], ["npm", "run", "build"], ["node", "services/whatsapp-gateway/scripts/sik16-parity.mjs"]]'))
results=[]
for i,c in enumerate(commands):
 x=subprocess.run(cmd+c,capture_output=True,text=True,timeout=240)
 f=r/('check-'+str(i)+'.log');f.write_text(x.stdout+x.stderr);os.chmod(f,0o600)
 results.append({'command':c,'exit':x.returncode,'log':str(f)})
 print('CHECK',i,'EXIT',x.returncode,'LOG',f)
 print((x.stdout+x.stderr)[-1400:])
(r/'result.json').write_text(json.dumps(results,indent=2));os.chmod(r/'result.json',0o600)
print('RESULT',r/'result.json')
