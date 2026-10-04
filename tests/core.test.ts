import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { NextRequest } from "next/server";
const testRoot = path.resolve(".data", "test-" + randomUUID());
process.env.SIKEPEL_DATA_DIR = testRoot;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_URL;
delete process.env.PDF_CONVERTER_URL;
const origin = "http://127.0.0.1:3000";
test(
  "SIKEPEL acceptance: auth, isolation, documents, numbering, snapshots, templates and roles",
  { timeout: 240000 },
  async (t) => {
    execFileSync(process.execPath, ["--import", "tsx", "tests/seed-fixtures.ts"], {
      env: {...process.env, SIKEPEL_TEST_FIXTURES: "1"},
      stdio: "pipe",
    });
    const access = await fs.readFile(
      path.join(testRoot, "AKSES-LOKAL.txt"),
      "utf8",
    );
    const password = access.match(/Kata sandi semua akun contoh: (.+)/)![1];
    const route = await import("../src/app/api/[...path]/route");
    const { getDB, one } = await import("../src/server/db");
    const { sessionUser } = await import("../src/server/security");
    const { generateLetter } = await import("../src/server/letters");
    const { createExampleTemplate } = await import("../src/server/documents");
    async function request(
      url: string,
      method = "GET",
      data?: unknown,
      cookie = "",
    ) {
      const body =
        data instanceof FormData
          ? data
          : data === undefined
            ? undefined
            : JSON.stringify(data);
      const req = new NextRequest(origin + "/api/" + url, {
        method,
        body,
        headers: {
          origin,
          ...(body && !(body instanceof FormData)
            ? { "content-type": "application/json" }
            : {}),
          ...(cookie ? { cookie } : {}),
        },
      });
      return (
        method === "GET"
          ? route.GET
          : method === "POST"
            ? route.POST
            : method === "DELETE"
              ? route.DELETE
              : route.PATCH
      )(req, {
        params: Promise.resolve({ path: url.split("?")[0].split("/") }),
      });
    }
    async function get(url: string, cookie: string) {
      const r = await request(url, "GET", undefined, cookie);
      assert.equal(r.status, 200, await r.clone().text());
      return r.json();
    }
    async function post(
      url: string,
      data: unknown,
      cookie = "",
      method = "POST",
    ) {
      const r = await request(url, method, data, cookie);
      assert.equal(r.status, 200, await r.clone().text());
      return r.json();
    }
    async function login(username: string) {
      const r = await request("login", "POST", { username, password });
      assert.equal(r.status, 200, await r.clone().text());
      return r.headers.get("set-cookie")!.split(";")[0];
    }
    const op = await login("operator"),
      other = await login("operator.b"),
      admin = await login("admin"),
      localAdmin = await login("admin.kelurahan"),
      leader = await login("pimpinan");
    const bootstrap = await get("bootstrap", op),
      otherBoot = await get("bootstrap", other);
    const residents = await get("residents", op),
      otherResidents = await get("residents", other);
    const resident = residents.items[0],
      type = bootstrap.types.find((x: any) => x.slug === "domisili"),
      official = bootstrap.officials[0];
    const form = {
      keperluan: "Keperluan pengujian pelayanan",
      alamat_domisili: resident.address,
      berlaku_mulai: "2026-09-08",
      berlaku_sampai: "2027-09-08",
      catatan: "Catatan internal",
    };
    let first: any, second: any, issued: any;
    try {
      await t.test(
        "invalid login, unauthenticated requests and origin rejection",
        async () => {
          assert.equal(
            (
              await request("login", "POST", {
                username: "operator",
                password: "wrong",
              })
            ).status,
            401,
          );
          assert.equal((await request("residents")).status, 401);
          const req = new NextRequest(origin + "/api/letters", {
            method: "POST",
            headers: { cookie: op, origin: "http://other.test" },
            body: "{}",
          });
          assert.equal(
            (
              await route.POST(req, {
                params: Promise.resolve({ path: ["letters"] }),
              })
            ).status,
            403,
          );
        },
      );
      await t.test(
        "tenant isolation and read-only leader enforced server-side",
        async () => {
          assert.notEqual(bootstrap.user.village_id, otherBoot.user.village_id);
          assert.equal(
            (
              await request(
                "residents/" + otherResidents.items[0].id,
                "GET",
                undefined,
                op,
              )
            ).status,
            403,
          );
          assert.equal(
            (await request("templates", "GET", undefined, op)).status,
            403,
          );
          assert.equal(
            (
              await request(
                "letters",
                "POST",
                { resident_id: resident.id, type_id: type.id },
                leader,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                "users",
                "POST",
                {
                  name: "Escalation",
                  username: "bad-role",
                  role: "SUPER_ADMIN",
                  active: true,
                  password: "VeryLongPassword!",
                },
                localAdmin,
              )
            ).status,
            403,
          );
        },
      );
      await t.test("resident validation and duplicate NIK", async () => {
        assert.equal(
          (await request("residents", "POST", { ...resident, nik: "123" }, op))
            .status,
          400,
        );
        assert.equal(
          (await request("residents", "POST", resident, op)).status,
          409,
        );
        const added = await post(
          "residents",
          { ...resident, nik: "0000000000088888", name: "Penduduk Uji Baru" },
          op,
        );
        assert.equal(added.name, "Penduduk Uji Baru");
      });
      await t.test(
        "draft does not allocate a number; preview creates an actual private PDF",
        async () => {
          first = await post(
            "letters",
            {
              type_id: type.id,
              resident_id: resident.id,
              official_id: official.id,
              form_data: form,
            },
            op,
          );
          assert.equal(first.number, null);
          assert.equal(first.status, "DRAFT");
          assert.equal(
            (await request("letters/" + first.id + "/issue", "POST", {}, op))
              .status,
            409,
          );
          const preview = await post(
            "letters/" + first.id + "/preview",
            {},
            op,
          );
          assert.equal(preview.status, "PREVIEW");
          assert.equal(preview.number, null);
          const pdf = await request(
            "letters/" + first.id + "/pdf?preview=1",
            "GET",
            undefined,
            op,
          );
          assert.equal(pdf.status, 200);
          assert.equal((await pdf.text()).slice(0, 5), "%PDF-");
          assert.equal(
            (
              await request(
                "letters/" + first.id + "/pdf?preview=1",
                "GET",
                undefined,
                other,
              )
            ).status,
            403,
          );
          second = await post(
            "letters",
            {
              type_id: type.id,
              resident_id: resident.id,
              official_id: official.id,
              form_data: form,
            },
            op,
          );
          await post("letters/" + second.id + "/preview", {}, op);
        },
      );
      await t.test(
        "concurrent numbering and duplicate issue are atomic and idempotent",
        async () => {
          const [a, b, a2] = await Promise.all([
            post("letters/" + first.id + "/issue", {}, op),
            post("letters/" + second.id + "/issue", {}, op),
            post("letters/" + first.id + "/issue", {}, op),
          ]);
          assert.notEqual(a.number, b.number);
          assert.equal(a.number, a2.number);
          assert.equal(a.sequence, a2.sequence);
          assert.equal(a.status, "ISSUE_PENDING");
          first = a;
          second = b;
        },
      );
      await t.test(
        "converter failure can retry without another number",
        async () => {
          const u = await sessionUser(op.split("=")[1]);
          const failed = await generateLetter(u!, first.id, {
            convert: async () => {
              throw new Error("Injected converter outage");
            },
          });
          assert.equal(failed.status, "ISSUE_PENDING");
          assert.equal(failed.number, first.number);
          assert.match(failed.error, /Nomor surat tetap/);
          issued = await post("letters/" + first.id + "/generate", {}, op);
          assert.equal(issued.status, "ISSUED");
          assert.equal(issued.number, first.number);
          const repeat = await post(
            "letters/" + first.id + "/generate",
            {},
            op,
          );
          assert.equal(repeat.number, issued.number);
        },
      );
      await t.test(
        "private PDF and historical resident/official snapshots remain immutable",
        async () => {
          const before = await request(
            "letters/" + first.id + "/pdf",
            "GET",
            undefined,
            op,
          );
          assert.equal(before.status, 200);
          const bytes = Buffer.from(await before.arrayBuffer());
          const hash = createHash("sha256").update(bytes).digest("hex");
          await post(
            "residents/" + resident.id,
            { ...resident, occupation: "Pekerjaan yang diperbarui" },
            op,
            "PATCH",
          );
          await post(
            "officials/" + official.id,
            { ...official, name: "Pejabat Baru" },
            localAdmin,
            "PATCH",
          );
          const detail = await get("letters/" + first.id, op);
          assert.equal(
            detail.snapshot.resident.occupation,
            resident.occupation,
          );
          assert.equal(detail.snapshot.official.name, official.name);
          const after = await request(
            "letters/" + first.id + "/pdf",
            "GET",
            undefined,
            op,
          );
          assert.equal(
            createHash("sha256")
              .update(Buffer.from(await after.arrayBuffer()))
              .digest("hex"),
            hash,
          );
          assert.equal(
            (await request("letters/" + first.id + "/pdf")).status,
            401,
          );
          assert.equal(
            (await request("letters/" + first.id, "GET", undefined, other))
              .status,
            403,
          );
          assert.equal(
            (
              await request(
                "letters/" + first.id,
                "PATCH",
                {
                  type_id: type.id,
                  resident_id: resident.id,
                  official_id: official.id,
                  form_data: form,
                },
                op,
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        "template versioning validates placeholders and preserves old versions",
        async () => {
          const original = (await get("templates", admin)).items.find(
            (x: any) => x.type_id === type.id,
          );
          const bytes = await createExampleTemplate(type);
          const upload = new FormData();
          upload.set("type_id", type.id);
          upload.set(
            "file",
            new File([new Uint8Array(bytes)], "version2.docx"),
          );
          const v2 = await post("templates", upload, admin);
          assert.equal(v2.version, 2);
          assert.equal(v2.errors.length, 0);
          await post("templates/" + v2.id + "/activate", {}, admin);
          const detail = await get("letters/" + first.id, op);
          assert.equal(detail.snapshot.template.id, original.id);
          assert.equal(
            (await get("templates", admin)).items.filter(
              (x: any) => x.type_id === type.id && x.active,
            ).length,
            1,
          );
          const badBytes = await createExampleTemplate({
            ...type,
            fields: [
              ...type.fields,
              {
                key: "unknown_value",
                label: "Unknown",
                type: "text",
                required: true,
              },
            ],
          });
          const bad = new FormData();
          bad.set("type_id", type.id);
          bad.set("file", new File([new Uint8Array(badBytes)], "invalid.docx"));
          const invalid = await post("templates", bad, admin);
          assert.ok(invalid.errors.length > 0);
          assert.equal(
            (
              await request(
                "templates/" + invalid.id + "/activate",
                "POST",
                {},
                admin,
              )
            ).status,
            400,
          );
        },
      );
      await t.test(
        "cancellation requires reason, preserves number, and writes audit",
        async () => {
          assert.equal(
            (
              await request(
                "letters/" + first.id + "/cancel",
                "POST",
                { reason: "" },
                localAdmin,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await request(
                "letters/" + first.id + "/cancel",
                "POST",
                { reason: "Tidak berwenang" },
                op,
              )
            ).status,
            403,
          );
          const cancelled = await post(
            "letters/" + first.id + "/cancel",
            { reason: "Pembatalan uji penerimaan" },
            localAdmin,
          );
          assert.equal(cancelled.status, "CANCELLED");
          assert.equal(cancelled.number, first.number);
          const log = await get("audit?q=LETTER_CANCELLED", localAdmin);
          assert.ok(log.items.some((x: any) => x.target_id === first.id));
          const count = await one(
            await getDB(),
            "SELECT last_sequence FROM counters WHERE village_id=$1 AND type_id=$2",
            [bootstrap.user.village_id, type.id],
          );
          assert.equal(count.last_sequence, 2);
        },
      );
      await t.test(
        "changed data requires a fresh preview before number allocation",
        async () => {
          const draft = await post(
            "letters",
            {
              type_id: type.id,
              resident_id: resident.id,
              official_id: official.id,
              form_data: form,
            },
            op,
          );
          await post("letters/" + draft.id + "/preview", {}, op);
          const current = await get("residents/" + resident.id, op);
          await post(
            "residents/" + resident.id,
            { ...current, occupation: "Perubahan setelah pratinjau" },
            op,
            "PATCH",
          );
          assert.equal(
            (await request("letters/" + draft.id + "/issue", "POST", {}, op))
              .status,
            409,
          );
          assert.equal((await get("letters/" + draft.id, op)).number, null);
        },
      );
      await t.test("Indonesian date, income and age formatting", async () => {
        const { terbilang, ageOn } = await import("../src/lib/formatters");
        assert.equal(terbilang(1250000), "satu juta dua ratus lima puluh ribu");
        assert.equal(terbilang(0), "nol");
        assert.equal(ageOn("2000-09-09", "2026-09-08"), 25);
        assert.equal(ageOn("2000-09-08", "2026-09-08"), 26);
      });
      await t.test(
        "global template removal preserves history, pending generation and version numbers",
        async () => {
          const originalId = issued.template_id;
          const listing = (await get("templates", admin)).items;
          assert.ok(
            listing.find((x: any) => x.id === originalId).usage_count >= 2,
          );
          for (const cookie of [op, localAdmin, leader]) {
            assert.equal(
              (
                await request(
                  "templates/" + originalId,
                  "DELETE",
                  undefined,
                  cookie,
                )
              ).status,
              403,
            );
          }
          assert.equal(
            (await request("templates/" + originalId, "DELETE")).status,
            401,
          );
          const priorPDF = Buffer.from(
            await (
              await request(
                "letters/" + first.id + "/pdf",
                "GET",
                undefined,
                op,
              )
            ).arrayBuffer(),
          );
          await post("templates/" + originalId, undefined, admin, "DELETE");
          assert.ok(
            !(await get("templates", admin)).items.some(
              (x: any) => x.id === originalId,
            ),
          );
          assert.equal(
            (
              await request(
                "templates/" + originalId + "/activate",
                "POST",
                {},
                admin,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request(
                "templates/" + originalId + "/download",
                "GET",
                undefined,
                admin,
              )
            ).status,
            404,
          );
          const afterPDF = Buffer.from(
            await (
              await request(
                "letters/" + first.id + "/pdf",
                "GET",
                undefined,
                op,
              )
            ).arrayBuffer(),
          );
          assert.ok(priorPDF.equals(afterPDF));
          const pending = await post(
            "letters/" + second.id + "/generate",
            {},
            op,
          );
          assert.equal(pending.status, "ISSUED");
          assert.equal(pending.template_id, originalId);
          const log = await get("audit?q=TEMPLATE_DELETE", admin);
          assert.ok(log.items.some((x: any) => x.target_id === originalId));
          const active = listing.find(
            (x: any) => x.type_id === type.id && x.active,
          );
          await post("templates/" + active.id, undefined, admin, "DELETE");
          assert.equal(
            (await get("bootstrap", op)).types.find(
              (x: any) => x.id === type.id,
            ).template_id,
            null,
          );
          const last = listing
            .filter((x: any) => x.type_id === type.id)
            .sort((a: any, b: any) => b.version - a.version)[0];
          await post("templates/" + last.id, undefined, admin, "DELETE");
          const upload = new FormData();
          upload.set("type_id", type.id);
          upload.set(
            "file",
            new File(
              [new Uint8Array(await createExampleTemplate(type))],
              "after-removal.docx",
            ),
          );
          const next = await post("templates", upload, admin);
          assert.equal(next.version, last.version + 1);
          await post("templates/" + next.id + "/activate", {}, admin);
          assert.equal(
            (await get("bootstrap", op)).types.find(
              (x: any) => x.id === type.id,
            ).template_id,
            next.id,
          );
        },
      );
      await t.test("user deactivation revokes access immediately", async () => {
        const users = await get("users", localAdmin);
        const operator = users.items.find(
          (u: any) => u.username === "operator",
        );
        await post(
          "users/" + operator.id,
          { ...operator, active: false },
          localAdmin,
          "PATCH",
        );
        assert.equal(
          (await request("bootstrap", "GET", undefined, op)).status,
          401,
        );
      });
    } finally {
      await (await getDB()).close();
    }
  },
);
