#!/usr/bin/env python3
import pathlib, subprocess, json, os, tempfile, fcntl

p = pathlib.Path('/home/cibodas/apps/sikepel/runtime-preflight/sik20-reupload')
lock_file = p.parent / 'sik20-check.lock'
lock = lock_file.open('w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

r = pathlib.Path(tempfile.mkdtemp(prefix='sik20-check-', dir=p.parent))
os.chmod(r, 0o700)

cmd = [
    'bwrap', '--die-with-parent', '--unshare-net', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/bin', '/bin',
    '--ro-bind', '/lib', '/lib',
    '--ro-bind', '/lib64', '/lib64',
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    '--tmpfs', '/home',
    '--ro-bind', '/etc', '/etc',
    '--ro-bind', '/opt/google/chrome', '/opt/google/chrome',
    '--ro-bind', '/home/cibodas/apps/sikepel/runtime-preflight/sik08-typecheck-h1amhajg/lo-runtime', '/lo',
    '--bind', str(p), '/candidate',
    '--ro-bind', '/home/cibodas/.npm/_cacache', '/cache/_cacache',
    '--tmpfs', '/cache/_cacache/tmp',
    '--clearenv',
    '--setenv', 'PATH', '/usr/bin:/bin',
    '--setenv', 'HOME', '/tmp',
    '--setenv', 'SIKEPEL_DATA_DIR', '/tmp/fixture-data',
    '--setenv', 'WA_SESSION_DIR', '/tmp/fixture-session',
    '--setenv', 'WA_GATEWAY_SECRET', 'fixture-only',
    '--setenv', 'SIKEPEL_INTERNAL_URL', 'http://127.0.0.1:1',
    '--setenv', 'NEXT_TELEMETRY_DISABLED', '1',
    '--setenv', 'LIBREOFFICE_PATH', '/lo/usr/lib/libreoffice/program/soffice',
    '--setenv', 'LD_LIBRARY_PATH', '/lo/usr/lib/libreoffice/program:/lo/usr/lib/x86_64-linux-gnu',
    '--setenv', 'LIBLANGTAG_DATA', '/lo/usr/share/liblangtag',
    '--chdir', '/candidate'
]

commands = [
    ["node", "node_modules/typescript/bin/tsc", "--noEmit"],
    ["./node_modules/tsx/dist/cli.mjs", "--test", "tests/mandiri-reupload-api.test.ts"],
    ["./node_modules/tsx/dist/cli.mjs", "--test", "tests/mandiri-reupload.test.ts"],
    ["npm", "test"],
    ["npm", "run", "build"]
]

results = []
for i, c in enumerate(commands):
    x = subprocess.run(cmd + c, capture_output=True, text=True, timeout=300)
    f = r / f'check-{i}.log'
    f.write_text(x.stdout + x.stderr)
    os.chmod(f, 0o600)
    results.append({'command': c, 'exit': x.returncode, 'log': str(f)})
    print(f'CHECK {i} EXIT {x.returncode} LOG {f}')

res_json = r / 'result.json'
res_json.write_text(json.dumps(results, indent=2))
os.chmod(res_json, 0o600)
print('FINAL RESULT PATH:', res_json)
