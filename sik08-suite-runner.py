import os,pathlib,subprocess,json,signal
os.umask(0o077)
r=pathlib.Path('/home/cibodas/apps/sikepel/runtime-preflight/sik08-typecheck-h1amhajg')
cmd=['bwrap','--unshare-net','--unshare-pid','--unshare-ipc','--unshare-uts','--die-with-parent','--new-session','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind','/usr','/usr','--ro-bind','/etc','/etc','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--bind',str(r),'/fixture','--ro-bind','/home/cibodas/apps/sikepel/node_modules','/fixture/app/node_modules','--chdir','/fixture/app','--','/usr/bin/node','node_modules/tsx/dist/cli.mjs','--test']
cmd += [str(p.relative_to(r/'app')) for p in sorted((r/'app/tests').glob('*.test.ts'))]
with (r/'private-full-suite.log').open('wb') as f:
 p=subprocess.Popen(cmd,env={'PATH':'/usr/bin:/bin','HOME':'/fixture','LANG':'C'},stdout=f,stderr=f,start_new_session=True)
 try:rc=p.wait(timeout=260)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait();rc=124
(r/'suite-evidence.json').write_text(json.dumps({'exit':rc,'test_files':len(list((r/'app/tests').glob('*.test.ts'))),'containment':'bwrap net/pid/ipc/uts minimal filesystem','no_prod_or_pg_started':True})+chr(10))
