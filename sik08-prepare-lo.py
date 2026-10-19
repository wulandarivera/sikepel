import pathlib,shutil,os
os.umask(0o077)
r=pathlib.Path('/home/cibodas/apps/sikepel/runtime-preflight/sik08-typecheck-h1amhajg')
source=pathlib.Path('/home/cibodas/apps/sikepel/.tools/linux-lo')
destination=r/'lo-runtime'
shutil.copytree(source,destination,symlinks=True,dirs_exist_ok=True)
for file in destination.rglob('*'):
 if file.is_symlink():
  target=str(file.readlink())
  if target.startswith(str(source)):
   file.unlink();file.symlink_to('/lo'+target[len(str(source)):])
 elif file.is_file() and file.name=='fundamentalrc':
  file.write_text(file.read_text().replace(str(source),'/lo'))
print('Private runtime relocation prepared; source untouched')
