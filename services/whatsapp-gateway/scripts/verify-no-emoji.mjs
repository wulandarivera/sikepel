import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const EMOJI_REGEX = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".data") {
          return [];
        }
        return walk(fullPath);
      }
      if (/\.(ts|js|mjs|cjs|json|md)$/.test(entry.name)) {
        return [fullPath];
      }
      return [];
    }),
  );
  return files.flat();
}

async function verify() {
  console.log("Memeriksa kepatuhan aturan ZERO EMOJI pada layanan WhatsApp Gateway...");
  const baseDir = path.resolve(import.meta.dirname, "..");
  const files = await walk(baseDir);
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      // Kecualikan pengecekan baris regex itu sendiri
      if (line.includes("EMOJI_REGEX") || line.includes("Extended_Pictographic")) {
        return;
      }
      // Bersihkan simbol legal copyright/trademark biasa
      const cleaned = line.replace(/[\u00A9\u00AE\u2122]/g, "");
      if (EMOJI_REGEX.test(cleaned)) {
        violations.push(`${path.relative(baseDir, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  if (violations.length > 0) {
    console.error("Ditemukan pelanggaran emoji:");
    violations.forEach((v) => console.error(v));
    process.exit(1);
  }

  console.log(`Pemeriksaan berhasil: ${files.length} berkas bersih dari emoji (ZERO EMOJI dipatuhi).`);
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
