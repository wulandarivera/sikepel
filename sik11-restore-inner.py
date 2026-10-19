#!/usr/bin/env python3
"""Authorized isolated restore only; never starts application code."""
import hashlib
import json
import os
import pathlib
import signal
import subprocess
import tempfile

BASE = pathlib.Path('/fixture')
BACKUP = pathlib.Path('/backup/database.dump.gz')
BIN = pathlib.Path('/usr/lib/postgresql/18/bin')
EXPECTED = 'cc938cb7e375881afd3ff11b51e09682cb73d6ac1e123fc0d9b65d7752d9db31'
os.umask(0o077)
run = pathlib.Path(tempfile.mkdtemp(prefix='sik06-pg-', dir=BASE))
sock = pathlib.Path(tempfile.mkdtemp(prefix='sik06-pg-', dir='/tmp'))
data = run / 'data'
evidence = {'run': str(run), 'socket': str(sock), 'pgdata': str(data), 'steps': []}
env = {'PATH': '/usr/bin:/bin', 'HOME': str(run), 'LANG': 'C', 'PGCONNECT_TIMEOUT': '5'}

def command(args, timeout=30, capture=False):
    result = subprocess.run([str(a) for a in args], env=env, capture_output=True, text=True, timeout=timeout)
    evidence['steps'].append({'command': pathlib.Path(str(args[0])).name, 'exit': result.returncode})
    if result.returncode:
        # Tool diagnostics can contain restored values; retain privately, never print.
        (run / 'private-error.log').write_text(result.stderr)
        raise RuntimeError('tool failed; private diagnostics retained')
    return result.stdout if capture else ''

def sql(query):
    return command([BIN/'psql', '-X', '-w', '-h', sock, '-p', '55484', '-U', 'cibodas', '-d', 'sik06_fixture', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], capture=True)

try:
    assert os.getuid() == 1000
    assert run.stat().st_mode & 0o777 == 0o700
    assert sock.stat().st_mode & 0o777 == 0o700
    assert hashlib.sha256(BACKUP.read_bytes()).hexdigest() == EXPECTED
    evidence['backup_sha256'] = EXPECTED
    command(['gzip', '-t', BACKUP])
    command([BIN/'initdb', '-D', data, '-U', 'cibodas', '--auth-local=trust', '--auth-host=reject', '--no-instructions'])
    with (data/'postgresql.conf').open('a') as f:
        f.write("\nlisten_addresses = ''\nport = 55484\nunix_socket_directories = '"+str(sock)+"'\nunix_socket_permissions = 0700\nshared_buffers = '32MB'\nmax_connections = 5\nmax_worker_processes = 0\n")
    command([BIN/'pg_ctl', '-D', data, '-l', run/'postgres.log', '-w', '-t', '15', 'start'], timeout=20)
    pid = int((data/'postmaster.pid').read_text().splitlines()[0])
    cmdline = pathlib.Path('/proc', str(pid), 'cmdline').read_bytes().split(b'\0')
    assert str(data).encode() in cmdline
    assert data.resolve() != pathlib.Path('/var/lib/postgresql/18/main').resolve()
    tcp = command(['ss', '-ltnp'], capture=True)
    assert 'pid='+str(pid)+',' not in tcp
    assert '55484' not in tcp
    assert (sock/'.s.PGSQL.55484').exists()
    # Before any SQL: inspect server-reported startup configuration offline.
    for key, expected in [('listen_addresses', ''), ('data_directory', str(data)), ('unix_socket_directories', str(sock))]:
        value = command([BIN/'postgres', '-D', data, '-C', key], capture=True).strip()
        assert value == expected
    evidence['pre_sql_isolation'] = {'pid': pid, 'distinct_pgdata': True, 'tcp55484_absent': True, 'listen_addresses': '', 'private_socket': True}
    command([BIN/'createdb', '-w', '-h', sock, '-p', '55484', '-U', 'cibodas', 'sik06_fixture'])
    checks = sql("SELECT current_setting('data_directory'), current_setting('listen_addresses'), current_database();").strip().split('|')
    assert checks == [str(data), '', 'sik06_fixture']
    with (run/'private-restore.log').open('wb') as log:
        producer = subprocess.Popen(['gzip', '-dc', str(BACKUP)], stdout=subprocess.PIPE, stderr=log, env=env)
        try:
            result = subprocess.run([str(BIN/'pg_restore'), '--no-owner', '--no-privileges', '--exit-on-error', '-h', str(sock), '-p', '55484', '-U', 'cibodas', '-d', 'sik06_fixture'], stdin=producer.stdout, stdout=log, stderr=log, env=env, timeout=60)
            producer.stdout.close()
            producer_rc = producer.wait(timeout=5)
            evidence['restore_exit'] = result.returncode
            evidence['gzip_stream_exit'] = producer_rc
            assert result.returncode == 0 and producer_rc == 0
        finally:
            if producer.poll() is None:
                producer.kill()
                producer.wait()
    aggregates = sql("SELECT 'tables', count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' UNION ALL SELECT 'residents',count(*) FROM residents UNION ALL SELECT 'letters',count(*) FROM letters UNION ALL SELECT 'users',count(*) FROM users UNION ALL SELECT 'online_requests',count(*) FROM online_requests;")
    evidence['aggregates'] = {line.split('|')[0]:int(line.split('|')[1]) for line in aggregates.strip().splitlines()}
    evidence['status'] = 'PASS'
except BaseException as exc:
    evidence['status'] = 'FAIL'
    evidence['error_type'] = type(exc).__name__
finally:
    if (data/'postmaster.pid').exists():
        try:
            command([BIN/'pg_ctl', '-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop'], timeout=20)
        except BaseException:
            evidence['stop_failure'] = True
    evidence['stopped'] = not (data/'postmaster.pid').exists() and not (sock/'.s.PGSQL.55484').exists()
    if not evidence['stopped']:
        evidence['status'] = 'FAIL'
    (run/'evidence.json').write_text(json.dumps(evidence, indent=2)+'\n')
    print(json.dumps(evidence), flush=True)
raise SystemExit(0 if evidence['status'] == 'PASS' else 1)
