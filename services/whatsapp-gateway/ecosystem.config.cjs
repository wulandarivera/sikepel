module.exports = {
  apps: [
    {
      name: "sikepel-wa-gateway",
      cwd: "/home/cibodas/apps/sikepel/services/whatsapp-gateway",
      script: "dist/index.js",
      args: "",
      env: {
        NODE_ENV: "production",
        WA_GATEWAY_PORT: "3001",
        WA_GATEWAY_HOST: "127.0.0.1",
        WA_SESSION_DIR: "/home/cibodas/apps/sikepel/.data/wa-session",
        SIKEPEL_INTERNAL_URL: "http://127.0.0.1:3000",
      },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
