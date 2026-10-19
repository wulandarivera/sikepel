import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  WhatsAppSessionManager,
  MessageMemoryStore,
  InMemoryCacheStore,
} from "../src/session.js";
import { DisconnectReason, proto } from "@whiskeysockets/baileys";
import { config } from "../src/config.js";

test("MessageMemoryStore: stores and retrieves proto message by id", () => {
  const store = new MessageMemoryStore(60000, 100);
  const fakeMessage = { conversation: "Halo tes pesan" } as proto.IMessage;

  store.set("msg-101", fakeMessage);
  assert.equal(store.has("msg-101"), true);
  assert.deepEqual(store.get("msg-101"), fakeMessage);

  assert.equal(store.get("msg-999"), undefined);
  assert.equal(store.has("msg-999"), false);
});

test("MessageMemoryStore: expires entries according to TTL", async () => {
  const store = new MessageMemoryStore(50, 100);
  const fakeMessage = { conversation: "Pesan kedaluwarsa" } as proto.IMessage;

  store.set("msg-expire", fakeMessage);
  assert.equal(store.has("msg-expire"), true);

  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(store.get("msg-expire"), undefined);
  assert.equal(store.has("msg-expire"), false);
});

test("MessageMemoryStore: bounds memory capacity and evicts oldest", () => {
  const store = new MessageMemoryStore(60000, 3);
  for (let i = 1; i <= 4; i++) {
    store.set(`msg-${i}`, { conversation: `Pesan ${i}` } as proto.IMessage);
  }

  assert.equal(store.size(), 3);
  assert.equal(store.has("msg-1"), false);
  assert.equal(store.has("msg-2"), true);
  assert.equal(store.has("msg-3"), true);
  assert.equal(store.has("msg-4"), true);
});

test("InMemoryCacheStore: implements CacheStore interface for retry tokens", () => {
  const cache = new InMemoryCacheStore();
  cache.set("retry-1", 1);
  assert.equal(cache.get("retry-1"), 1);

  cache.set("retry-1", 2);
  assert.equal(cache.get("retry-1"), 2);

  cache.del("retry-1");
  assert.equal(cache.get("retry-1"), undefined);

  cache.set("retry-2", 5);
  cache.flushAll();
  assert.equal(cache.get("retry-2"), undefined);
});

test("WhatsAppSessionManager: getMessage callback returns stored message proto", async () => {
  const manager = new WhatsAppSessionManager();
  const fakeProto = { conversation: "Tanggapan permohonan" } as proto.IMessage;

  manager.storeMessage("MSG-ABC-123", fakeProto);

  const byKey = await manager.getMessage({ id: "MSG-ABC-123" });
  assert.deepEqual(byKey, fakeProto);

  const byStringId = await manager.getMessage("MSG-ABC-123");
  assert.deepEqual(byStringId, fakeProto);

  const notFound = await manager.getMessage({ id: "NON_EXISTENT" });
  assert.equal(notFound, undefined);

  const emptyKey = await manager.getMessage({});
  assert.equal(emptyKey, undefined);
});

test("WhatsAppSessionManager: detects fatal Bad MAC and corrupted session errors", () => {
  const manager = new WhatsAppSessionManager();

  assert.equal(
    manager.isFatalSessionCorruption({
      output: { statusCode: DisconnectReason.badSession },
    }),
    true,
  );

  assert.equal(
    manager.isFatalSessionCorruption(new Error("Bad MAC in session cipher")),
    true,
  );

  assert.equal(
    manager.isFatalSessionCorruption(
      new Error("Failed to decrypt message with any known session"),
    ),
    true,
  );

  assert.equal(
    manager.isFatalSessionCorruption(
      new Error("No matching sessions found for message"),
    ),
    true,
  );

  assert.equal(
    manager.isFatalSessionCorruption({
      output: { statusCode: DisconnectReason.connectionClosed },
    }),
    false,
  );

  assert.equal(
    manager.isFatalSessionCorruption({
      output: { statusCode: DisconnectReason.restartRequired },
    }),
    false,
  );
});

test("WhatsAppSessionManager: detects decryption ciphertext stub failures", () => {
  const manager = new WhatsAppSessionManager();

  const ciphertextStub = {
    key: { id: "bad-1" },
    messageStubType: proto.WebMessageInfo.StubType.CIPHERTEXT,
    messageStubParameters: ["Bad MAC"],
  } as proto.IWebMessageInfo;

  assert.equal(manager.isDecryptionFailure(ciphertextStub), true);

  const normalMessage = {
    key: { id: "good-1" },
    message: { conversation: "Halo kelurahan" },
  } as proto.IWebMessageInfo;

  assert.equal(manager.isDecryptionFailure(normalMessage), false);
});

test("WhatsAppSessionManager: resetSession blocks without deleting auth or reconnecting", async () => {
  const tempSessionDir = path.resolve(config.sessionDir, "../test-reset-session");
  const previousSessionDir = config.sessionDir;
  config.sessionDir = tempSessionDir;

  await fs.mkdir(tempSessionDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(tempSessionDir, "creds.json"), "{\"corrupted\":true}");

  const manager = new WhatsAppSessionManager();
  manager.storeMessage("test-key", { conversation: "Sebelum reset" } as proto.IMessage);
  manager.retryCache.set("retry-key", 3);

  let connectCalled = 0;
  (manager as any).connect = async () => {
    connectCalled++;
  };

  try {
    await manager.resetSession("test_corruption");

    assert.equal(connectCalled, 0);
    assert.equal(manager.messageStore.has("test-key"), true);
    assert.equal(manager.retryCache.get("retry-key"), 3);

    const credsExist = await fs
      .access(path.join(tempSessionDir, "creds.json"))
      .then(() => true)
      .catch(() => false);
    assert.equal(credsExist, true);

    // Debounce check: second reset within 30s should be debounced
    await manager.resetSession("second_immediate_reset");
    assert.equal(connectCalled, 0);
  } finally {
    config.sessionDir = previousSessionDir;
    await fs.rm(tempSessionDir, { recursive: true, force: true }).catch(() => {});
  }
});
