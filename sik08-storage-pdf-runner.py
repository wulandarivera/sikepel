import os,pathlib,subprocess,json,signal
os.umask(0o077)
r=pathlib.Path('/home/cibodas/apps/sikepel/runtime-preflight/sik08-typecheck-h1amhajg')
cmd=['bwrap','--unshare-net','--unshare-pid','--unshare-ipc','--unshare-uts','--die-with-parent','--new-session','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind','/usr','/usr','--ro-bind','/etc','/etc','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--bind',str(r),'/fixture','--ro-bind','/home/cibodas/apps/sikepel/node_modules','/fixture/app/node_modules','--chdir','/fixture/app','--ro-bind','/home/cibodas/apps/sikepel/.tools/linux-lo','/lo','--','/usr/bin/node','--import','tsx','sik08-storage-pdf.ts']
with (r/'private-storage-pdf.log').open('wb') as f:
 p=subprocess.Popen(cmd,env={'PATH':'/usr/bin:/bin','HOME':'/fixture','LANG':'C','SIKEPEL_DATA_DIR':'/fixture/synthetic-storage','LIBREOFFICE_PATH':'/lo/usr/lib/libreoffice/program/soffice','LD_LIBRARY_PATH':'/lo/usr/lib/libreoffice/program:/lo/usr/lib/x86_64-linux-gnu','LIBLANGTAG_DATA':'/lo/usr/share/liblangtag'},stdout=f,stderr=f,start_new_session=True)
 try:rc=p.wait(timeout=110)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait();rc=124
(r/'storage-pdf-runner-evidence.json').write_text(json.dumps({'exit':rc,'test_files':len(list((r/'app/tests').glob('*.test.ts'))),'containment':'bwrap net/pid/ipc/uts minimal filesystem','no_prod_or_pg_started':True})+chr(10))