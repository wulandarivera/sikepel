module.exports = {
  apps: [
    {
      name: "sikepel",
      cwd: "/home/cibodas/apps/sikepel",
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 100.67.16.86 --port 3000",
      env: {
        NODE_ENV: "production",
        LIBREOFFICE_PATH: "/home/cibodas/apps/sikepel/.tools/linux-lo/usr/lib/libreoffice/program/soffice",
        LD_LIBRARY_PATH: "/home/cibodas/apps/sikepel/.tools/linux-lo/usr/lib/libreoffice/program:/home/cibodas/apps/sikepel/.tools/linux-lo/usr/lib/x86_64-linux-gnu",
        LIBLANGTAG_DATA: "/home/cibodas/apps/sikepel/.tools/linux-lo/usr/share/liblangtag"
      }
    }
  ]
};
