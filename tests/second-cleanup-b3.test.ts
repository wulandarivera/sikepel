import test from "node:test";
import assert from "node:assert/strict";
import { api, APIError } from "../src/components/common";
test("network failure produces safe Indonesian error", async()=>{ const old=globalThis.fetch; globalThis.fetch=async()=>{throw new TypeError("Failed to fetch")}; try {await assert.rejects(api("test"),e=>e instanceof APIError && e.message==="Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");} finally {globalThis.fetch=old} });
test("non JSON response produces safe Indonesian error", async()=>{const old=globalThis.fetch;globalThis.fetch=async()=>new Response("<html>Proxy failed</html>",{status:502});try{await assert.rejects(api("test"),e=>e instanceof APIError && e.status===502 && e.message==="Respons server tidak dapat dibaca. Coba lagi nanti.");}finally{globalThis.fetch=old}});
test("validation fields remain available",async()=>{const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:"Periksa data.",fields:{nik:"NIK wajib diisi."}},{status:400});try{await assert.rejects(api("test"),e=>e instanceof APIError && e.fields?.nik==="NIK wajib diisi.");}finally{globalThis.fetch=old}});
