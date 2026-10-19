import argparse
_parser=argparse.ArgumentParser(description='Execute authorized isolated copied-DB runtime fixture only.')
_parser.add_argument('--execute',action='store_true',help='Explicitly execute fixture with side effects')
_args=_parser.parse_args()
if not _args.execute:
 _parser.error('explicit --execute required')
import pathlib,os,subprocess,tempfile,shutil,json,hashlib
os.umask(0o077)
base=pathlib.Path('/home/cibodas/apps/sikepel/runtime-preflight')
prep=base/'sik04-pm2-json-preparation'
release=pathlib.Path('/home/cibodas/apps/sikepel/releases/e968338a106d672f0a7682d456a82567aadd080e')
root=pathlib.Path(tempfile.mkdtemp(prefix='sik09-runtime-',dir=base));print('HANDLE',root,flush=True)
for name in ['storage','socket','home','app']:(root/name).mkdir(mode=0o700)
shutil.copytree(base/'sik06-pg-z4zg2kxt/data',root/'pgdata',symlinks=False)
assert not (root/'pgdata/postmaster.pid').exists()
# Source files from Git; no dotenv, shared storage, gateway services or production symlinks.
archive=subprocess.Popen(['git','archive','e968338a106d672f0a7682d456a82567aadd080e'],cwd=prep,stdout=subprocess.PIPE)
subprocess.run(['tar','-x','-C',str(root/'app')],stdin=archive.stdout,check=True);archive.stdout.close();assert archive.wait()==0
for p in list((root/'app').glob('.env*')):p.unlink()
# Reject symlinks before execution; dependencies are mounted read-only, never symlinked.
assert not any(p.is_symlink() for p in (root/'app').rglob('*'))
shutil.copytree(release/'.next',root/'app/.next',symlinks=False)
assert not any(p.is_symlink() for p in (root/'app/.next').rglob('*'))
def digest(path):
 h=hashlib.sha256()
 for p in sorted(path.rglob('*')):
  if p.is_file():h.update(str(p.relative_to(path)).encode());h.update(p.read_bytes())
 return h.hexdigest()
a=digest(release/'.next');b=digest(root/'app/.next');assert a==b
(root/'build-parity.json').write_text(json.dumps({'release':str(release),'build_sha256':a,'copy_sha256':b,'equal':True})+'\n')
shutil.copyfile(prep/'sik09-inner.py',root/'runtime-fixture-inner.py')
shutil.copyfile(prep/'sik09-boundary.ts',root/'app/sik09-boundary.ts')
(root/'app/node_modules').mkdir()
cmd=['bwrap','--unshare-net','--unshare-pid','--unshare-ipc','--unshare-uts','--new-session','--die-with-parent','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind','/usr','/usr','--ro-bind','/etc','/etc','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--bind',str(root),'/fixture','--ro-bind',str(release/'node_modules'),'/fixture/app/node_modules','--chdir','/fixture','--setenv','SIK07_HOST_NETNS',os.readlink('/proc/self/ns/net'),'--','/usr/bin/python3','/fixture/runtime-fixture-inner.py']
with (root/'private-supervisor.log').open('wb') as log:
 try:
  p=subprocess.run(cmd,env={'PATH':'/usr/bin:/bin','LANG':'C'},stdout=log,stderr=log,timeout=450)
  code=p.returncode
 except subprocess.TimeoutExpired:code=124
(root/'supervisor-evidence.json').write_text(json.dumps({'exit':code,'handle':str(root),'build_parity':a})+'\n')
print('SUPERVISOR_EXIT',code,flush=True)
if (root/'runtime-evidence.json').exists():print((root/'runtime-evidence.json').read_text(),flush=True)
raise SystemExit(code)
