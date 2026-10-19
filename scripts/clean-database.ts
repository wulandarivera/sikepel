import fs from "node:fs/promises";
import path from "node:path";
import { getDB, dataRoot } from "../src/server/db";

async function main() {
  console.log("Memulai pembersihan data kelurahan dan user demo...");
  const db = await getDB();

  await db.transaction(async (tx) => {
    // 1. Hapus data transaksi dan relasi kelurahan
    console.log("- Menghapus data sesi & percobaan login...");
    await tx.query("DELETE FROM sessions");
    await tx.query("DELETE FROM login_attempts");

    console.log("- Menghapus surat demo...");
    await tx.query("DELETE FROM letters");

    console.log("- Menghapus data penduduk demo...");
    await tx.query("DELETE FROM residents");

    console.log("- Menghapus data pejabat demo...");
    await tx.query("DELETE FROM officials");

    console.log("- Menghapus counter penomoran surat kelurahan...");
    await tx.query("DELETE FROM counters");

    console.log("- Menghapus log audit demo...");
    await tx.query("DELETE FROM audit_logs");

    // 2. Hapus semua user kecuali SUPER_ADMIN
    console.log("- Menghapus user kelurahan demo...");
    const deletedUsers = await tx.query(
      "DELETE FROM users WHERE role != 'SUPER_ADMIN' RETURNING username, role"
    );
    console.log(
      `  User dihapus (${deletedUsers.rows.length}):`,
      deletedUsers.rows.map((u: any) => `${u.username} (${u.role})`).join(", ")
    );

    // 3. Hapus semua kelurahan
    console.log("- Menghapus semua kelurahan...");
    const deletedVillages = await tx.query(
      "DELETE FROM villages RETURNING name, code"
    );
    console.log(
      `  Kelurahan dihapus (${deletedVillages.rows.length}):`,
      deletedVillages.rows.map((v: any) => `${v.name} (${v.code})`).join(", ")
    );

    // 4. Pastikan SUPER_ADMIN tetap ada dan bersih dari village_id
    await tx.query(
      "UPDATE users SET village_id = NULL WHERE role = 'SUPER_ADMIN'"
    );
  });

  // 5. Verifikasi hasil
  const remainingUsers = await db.query("SELECT id, username, name, role FROM users");
  const remainingVillages = await db.query("SELECT count(*)::int as count FROM villages");
  const remainingLetters = await db.query("SELECT count(*)::int as count FROM letters");
  const remainingResidents = await db.query("SELECT count(*)::int as count FROM residents");
  const remainingTemplates = await db.query("SELECT count(*)::int as count FROM templates");

  console.log("\n--- HASIL AKHIR DATABASE ---");
  console.log("User tersisa:", remainingUsers.rows);
  console.log("Kelurahan tersisa:", remainingVillages.rows[0].count);
  console.log("Surat tersisa:", remainingLetters.rows[0].count);
  console.log("Penduduk tersisa:", remainingResidents.rows[0].count);
  console.log("Template surat tersisa (tetap aman):", remainingTemplates.rows[0].count);

  await db.close();

  // 6. Bersihkan file PDF demo di storage (generated & previews), pertahankan templates
  const storageRoot = path.join(dataRoot(), "storage");
  for (const sub of ["generated", "previews"]) {
    const dir = path.join(storageRoot, sub);
    try {
      const items = await fs.readdir(dir);
      for (const item of items) {
        await fs.rm(path.join(dir, item), { recursive: true, force: true });
      }
      console.log(`- Folder storage/${sub} telah dibersihkan.`);
    } catch {}
  }

  // 7. Update .data/AKSES-LOKAL.txt
  const adminAccount = remainingUsers.rows.find((u: any) => u.role === "SUPER_ADMIN");
  const aksesLokalPath = path.join(dataRoot(), "AKSES-LOKAL.txt");
  try {
    const content = `SIKEPEL — AKSES SUPER ADMIN

Username : ${adminAccount?.username || "admin"}
Nama     : ${adminAccount?.name || "Admin Kecamatan"}
Peran    : Super Admin Kecamatan
Kata Sandi: (Gunakan kata sandi admin yang telah dibuat saat setup)

Catatan:
- Semua data kelurahan dan user contoh telah dibersihkan.
- Super Admin dapat membuat Kelurahan baru melalui menu "Kelurahan".
- Super Admin dapat membuat Akun Pejabat & Operator baru melalui menu "Pengguna".
`;
    await fs.writeFile(aksesLokalPath, content, "utf8");
    console.log("- Berkas .data/AKSES-LOKAL.txt telah diperbarui.");
  } catch (e) {
    console.warn("Gagal memperbarui AKSES-LOKAL.txt:", e);
  }

  console.log("\nProses pembersihan selesai dengan sukses!");
}

main().catch((err) => {
  console.error("Error saat pembersihan:", err);
  process.exit(1);
});
