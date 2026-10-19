import pathlib, subprocess, json, os, tempfile, fcntl, hashlib

p = pathlib.Path('/home/cibodas/apps/sikepel/runtime-preflight/sik19-reupload-ui')
lock = (p.parent / 'sik19-check.lock').open('w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

r = pathlib.Path(tempfile.mkdtemp(prefix='sik19-check-', dir=p.parent))
os.chmod(r, 0o700)

cmd = [
    'bwrap',
    '--die-with-parent',
    '--unshare-net',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
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
    '--ro-bind', '/home/cibodas/apps/sikepel/runtime-preflight/sik26-deps-uxytaath/node_modules', '/candidate/node_modules',
    '--ro-bind', '/home/cibodas/apps/sikepel/runtime-preflight/sik26-deps-uxytaath/services/whatsapp-gateway/node_modules', '/candidate/services/whatsapp-gateway/node_modules',
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
    '--chdir', '/candidate',
]

commands = [
    ["node", "node_modules/typescript/bin/tsc", "--noEmit"],
    ["npm", "test"],
    ["node", "scripts/sik19-browser.mjs"],
    ["npm", "run", "build"],
]

results = []
all_ok = True

for i, c in enumerate(commands):
    print(f"RUNNING STEP {i}: {' '.join(c)}")
    x = subprocess.run(cmd + c, capture_output=True, text=True, timeout=300)
    out_text = x.stdout + x.stderr
    log_file = r / f"check-{i}.log"
    log_file.write_text(out_text)
    os.chmod(log_file, 0o600)
    
    status = "PASS" if x.returncode == 0 else "FAIL"
    print(f"STEP {i} {status} (exit {x.returncode}) -> {log_file}")
    if x.returncode != 0:
        all_ok = False
        print(out_text[-1200:])
    else:
        # print concise snippet of pass
        lines = [l for l in out_text.strip().splitlines() if l.strip()]
        for line in lines[-5:]:
            print(f"  {line}")

    results.append({
        'step': i,
        'command': c,
        'exit': x.returncode,
        'status': status,
        'log': str(log_file),
    })

res_file = r / 'result.json'
res_file.write_text(json.dumps(results, indent=2))
os.chmod(res_file, 0o600)

sha = hashlib.sha256(res_file.read_bytes()).hexdigest()
print(f"RESULT: {res_file} (SHA256: {sha})")

if not all_ok:
    print("VERIFICATION FAILED")
    raise SystemExit(1)

print("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY")
