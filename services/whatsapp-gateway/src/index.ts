import { config } from "./config.js";
import { logger } from "./logger.js";
import { WhatsAppSessionManager } from "./session.js";
import { createHttpServer } from "./server.js";

async function main() {
  logger.info(
    { port: config.port, host: config.host, sessionDir: config.sessionDir },
    "Memulai SIKEPEL Local WhatsApp Gateway & Hotline Service",
  );

  const sessionManager = new WhatsAppSessionManager();
  const server = createHttpServer(sessionManager);

  server.listen(config.port, config.host, () => {
    logger.info(
      { url: `http://${config.host}:${config.port}` },
      "Server HTTP internal WhatsApp Gateway aktif",
    );
  });

  await sessionManager.init();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Menerima sinyal penghentian, menutup layanan...");
    server.close();
    await sessionManager.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ error: err.message }, "Fatal error pada WhatsApp Gateway");
  process.exit(1);
});
