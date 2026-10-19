import pathlib,subprocess,os,tempfile,shutil,json
os.umask(0o077)
p=pathlib.Path('/home/cibodas/apps/sikepel/runtime-preflight/sik04-pm2-json-preparation')
r=pathlib.Path(tempfile.mkdtemp(prefix='sik11-restore-',dir=p.parent))
shutil.copyfile(p/'sik11-restore-inner.py',r/'inner.py')
cmd=['bwrap','--unshare-net','--unshare-pid','--unshare-ipc','--unshare-uts','--new-session','--die-with-parent','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind','/usr','/usr','--ro-bind','/etc','/etc','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--bind',str(r),'/fixture','--ro-bind','/home/cibodas/backups/sik11-20261016_191502','/backup','--chdir','/fixture','--','python3','/fixture/inner.py']
with (r/'private-restore.log').open('wb') as f:
 x=subprocess.run(cmd,env={'PATH':'/usr/bin:/bin'},stdout=f,stderr=f,timeout=150)
(r/'supervisor-evidence.json').write_text(json.dumps({'exit':x.returncode,'handle':str(r)}))
print(r,x.returncode)
