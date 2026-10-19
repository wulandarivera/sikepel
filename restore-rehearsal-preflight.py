#!/usr/bin/env python3
"""Resource-boundary preflight only. No initdb, server, SQL or restore execution."""
import json
import os
import pathlib
import shutil
import subprocess
import sys

if sys.argv[1:] != ['--describe']:
    raise SystemExit('Execution disabled: independent QA and explicit citizen-backup restore permission required')
root = pathlib.Path('/home/cibodas/apps/sikepel/runtime-preflight')
bin_dir = pathlib.Path('/usr/lib/postgresql/18/bin')
backup = pathlib.Path('/home/cibodas/backups/sikepel_pg_20261016_160109.dump.gz')
assert os.getuid() == 1000
assert root.is_dir() and os.access(root, os.W_OK | os.X_OK)
assert backup.is_file() and os.access(backup, os.R_OK)
for name in ['initdb', 'pg_ctl', 'pg_restore', 'createdb', 'psql']:
    assert os.access(bin_dir / name, os.X_OK)
for name in ['initdb', 'pg_ctl']:
    result = subprocess.run([str(bin_dir / name), '--version'], capture_output=True, text=True, check=True)
    print(result.stdout.strip())
print(json.dumps({
    'mode': 'preflight-only; execution prohibited',
    'owner_uid': 1000,
    'private_directory_future': str(root / 'sik04-pg-<random>'),
    'directory_mode_future': '0700; umask077',
    'socket_directory_future': '/tmp/sik04-pg-<random> mode0700',
    'listen_addresses_future': '',
    'unix_socket_permissions_future': '0700',
    'socket_port_future': 55484,
    'database_future': 'sik04_fixture',
    'postgres_options_future': "-c listen_addresses='' -c unix_socket_permissions=0700 -c shared_buffers=32MB -c max_connections=5 -c max_worker_processes=0",
    'restore_future': 'gzip -dc backup | pg_restore --no-owner --no-privileges --exit-on-error --host PRIVATE_SOCKET --port55484 --dbname sik04_fixture',
    'backup': str(backup),
    'free_bytes': shutil.disk_usage(root).free,
    'contents_exported': False,
    'application_or_wa_started': False,
    'production_socket_or_port_used': False,
    'execution_enabled': False
}, indent=2))
