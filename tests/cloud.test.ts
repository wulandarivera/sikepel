import test from "node:test";
import assert from "node:assert/strict";
import { cloudConfigErrors, assertCloudConfig, maxTemplateBytes } from "../src/server/cloud-config";
import { ConvertApiConverter, GotenbergConverter, LibreOfficeConverter } from "../src/server/documents";
import { LocalStorage } from "../src/server/storage";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Vercel configuration refuses local fallbacks and incomplete credentials", async () => {
  const valid = { DATABASE_URL:"postgresql://user:password@db.example/db?sslmode=require", SUPABASE_URL:"https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY:"secret", SUPABASE_BUCKET:"sikepel", PDF_CONVERTER_URL:"https://pdf.example", PDF_CONVERTER_USERNAME:"sikepel", PDF_CONVERTER_PASSWORD:"password" };
  assert.deepEqual(cloudConfigErrors(valid), []);
  assert.ok(cloudConfigErrors({ ...valid, DATABASE_URL:"postgresql://user:password@db.example/db" }).some(e=>e.includes("sslmode")));
  assert.ok(cloudConfigErrors({ ...valid, PDF_CONVERTER_PASSWORD:"" }).some(e=>e.includes("PDF_CONVERTER")));
  const before=process.env.VERCEL;
  const databaseBefore=process.env.DATABASE_URL;
  process.env.VERCEL="1";
  delete process.env.DATABASE_URL;
  try {
    assert.throws(()=>assertCloudConfig());
    assert.equal(maxTemplateBytes(),4*1024*1024);
    await assert.rejects(new LocalStorage().get("a.pdf"), /lokal/);
    await assert.rejects(new LibreOfficeConverter().convert(Buffer.from("docx")), /PDF_CONVERTER_URL/);
  } finally {
    if(before===undefined) delete process.env.VERCEL; else process.env.VERCEL=before;
    if(databaseBefore===undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=databaseBefore;
  }
});

test("Cloud converter sends authenticated requests, validates PDF and rejects oversized Vercel responses", async () => {
  const keys=["VERCEL","PDF_CONVERTER_URL","PDF_CONVERTER_TOKEN","PDF_CONVERTER_USERNAME","PDF_CONVERTER_PASSWORD"];
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const originalFetch=globalThis.fetch;
  process.env.VERCEL="1"; process.env.PDF_CONVERTER_URL="https://pdf.example/";
  delete process.env.PDF_CONVERTER_TOKEN;
  process.env.PDF_CONVERTER_USERNAME="user"; process.env.PDF_CONVERTER_PASSWORD="password";
  try {
    globalThis.fetch=async (url, init) => {
      assert.equal(url,"https://pdf.example/forms/libreoffice/convert");
      assert.equal(new Headers(init?.headers).get("Authorization"),`Basic ${Buffer.from("user:password").toString("base64")}`);
      return new Response("%PDF-1.7 test");
    };
    assert.ok((await new GotenbergConverter().convert(Buffer.from("docx"))).toString().startsWith("%PDF-"));
    process.env.PDF_CONVERTER_TOKEN="gateway-token";
    globalThis.fetch=async (_,init)=>{assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer gateway-token");return new Response("error");};
    await assert.rejects(new GotenbergConverter().convert(Buffer.from("docx")),/Invalid PDF/);
    globalThis.fetch=async ()=>new Response("%PDF-"+"x".repeat(4*1024*1024));
    await assert.rejects(new GotenbergConverter().convert(Buffer.from("docx")),/Invalid PDF/);
  } finally { globalThis.fetch=originalFetch; for(const key of keys) { if(before[key]===undefined) delete process.env[key];else process.env[key]=before[key]; } }
});

test("ConvertAPI sends DOCX as multipart and decodes inline PDF", async () => {
  const keys=["VERCEL","PDF_CONVERTER_URL","PDF_CONVERTER_PROVIDER","PDF_CONVERTER_TOKEN"];
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const originalFetch=globalThis.fetch;
  process.env.VERCEL="1"; process.env.PDF_CONVERTER_PROVIDER="convertapi"; process.env.PDF_CONVERTER_URL="https://v2.convertapi.com/"; process.env.PDF_CONVERTER_TOKEN="token";
  try {
    globalThis.fetch=async (url, init) => {
      assert.equal(url,"https://v2.convertapi.com/convert/docx/to/pdf");
      assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer token");
      assert.equal((await new Request(String(url), init).formData()).get("StoreFile"),"false");
      return new Response(JSON.stringify({Files:[{FileData:Buffer.from("%PDF-1.7 test").toString("base64")}]}), {headers:{"content-type":"application/json"}});
    };
    assert.ok((await new ConvertApiConverter().convert(Buffer.from("docx"))).toString().startsWith("%PDF-"));
  } finally { globalThis.fetch=originalFetch; for(const key of keys) { if(before[key]===undefined) delete process.env[key]; else process.env[key]=before[key]; } }
});

test("Cloud migration protects tables from anonymous Data API access without blocking the table owner", async () => {
  const db=new PGlite();
  try {
    await db.exec(await fs.readFile("migrations/001_core.sql","utf8"));
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;");
    await db.exec(await fs.readFile("migrations/002_cloud_access.sql","utf8"));
    const result=await db.query<{relrowsecurity:boolean}>("SELECT relrowsecurity FROM pg_class WHERE oid='public.users'::regclass");
    assert.equal(result.rows[0].relrowsecurity,true);
    await db.query("SELECT * FROM users");
    await db.exec("SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM users"),/permission denied/);
    await db.exec("RESET ROLE");
  } finally { await db.close(); }
});
