import { test } from "node:test";
import fs from "node:fs";
test("archive detail mounts the read-only completeness section for every status", () => {
 const source = fs.readFileSync("src/components/service.tsx","utf8").split("function ArchiveDetail")[1];
 assert.match(source, /<RequirementDetail letter=\{l\} \/>/);
});
import assert from "node:assert/strict";
import * as helpers from "../src/lib/requirements";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as components from "../src/components/requirement-detail";

test("detail section renders explicit missing names, counts, and mandatory/optional labels", () => {
 assert.equal(typeof (components as any).RequirementDetail,"function");
 const html = renderToStaticMarkup(createElement((components as any).RequirementDetail,{letter:{status:"DRAFT",type:{requirements},form_data:{requirement_checks:{ktp:true}}}}));
 assert.match(html,/Kelengkapan Berkas/);
 assert.match(html,/Kartu Keluarga/);
 assert.match(html,/Surat pendukung/);
 assert.match(html,/Wajib/);
 assert.match(html,/Opsional/);
 assert.match(html,/1 \/ 3 berkas lengkap/);
 assert.match(html,/Persyaratan wajib belum lengkap/);
});

test("complete and optional-only missing details render truthful status", () => {
 const render = (checks: Record<string,boolean>) => renderToStaticMarkup(createElement(components.RequirementDetail,{letter:{status:"PREVIEW",type:{requirements},form_data:{requirement_checks:checks}}}));
 assert.match(render({ktp:true,kk:true,extra:true}),/Seluruh persyaratan wajib sudah lengkap/);
 assert.doesNotMatch(render({ktp:true,kk:true,extra:true}),/Berkas yang belum lengkap/);
 const optional = render({ktp:true,kk:true});
 assert.match(optional,/Seluruh persyaratan wajib sudah lengkap/);
 assert.match(optional,/Surat pendukung/);
 assert.doesNotMatch(optional,/Persyaratan wajib belum lengkap/);
 const unknown = renderToStaticMarkup(createElement(components.RequirementDetail,{letter:{status:"ISSUED"}}));
 assert.match(unknown,/Persyaratan belum ditetapkan\/tidak ada data persyaratan/);
 assert.doesNotMatch(unknown,/Seluruh persyaratan wajib sudah lengkap/);
});
test("absent config or historic snapshot is unknown, not complete", () => {
 for (const letter of [{status:"DRAFT"},{status:"PREVIEW",type:{requirements:[]}},{status:"ISSUED",type:{requirements:[{id:"current",label:"Current",mandatory:true}]}},{status:"CANCELLED",snapshot:{requirements:[]}}]) {
  assert.equal(helpers.requirementDetail(letter).complete,null);
 }
});
const requirements = [{id:"ktp",label:"Fotokopi KTP",mandatory:true},{id:"kk",label:"Kartu Keluarga",mandatory:true},{id:"extra",label:"Surat pendukung",mandatory:false}];
test("draft detail identifies missing names from saved checks and current requirements", () => {
 const resolve = (helpers as any).requirementDetail;
 assert.equal(typeof resolve, "function", "detail resolver must exist");
 const detail = resolve({status:"DRAFT",type:{requirements},form_data:{requirement_checks:{ktp:true}},snapshot:{requirements:[],form_data:{requirement_checks:{kk:true}}}});
 assert.deepEqual(detail.missing.map((r:any)=>r.label),["Kartu Keluarga","Surat pendukung"]);
 assert.equal(detail.completed,1);
 assert.equal(detail.mandatoryCompleted,1);
 assert.equal(detail.mandatoryTotal,2);
 assert.equal(detail.complete,false);
 assert.equal(detail.source,"current");
});
test("numbered history uses immutable snapshot labels and checks, never changed config or mutable form", () => {
 for (const status of ["ISSUED","CANCELLED","ISSUE_PENDING"]) {
  const detail = helpers.requirementDetail({status,type:{requirements:[{id:"new",label:"New configuration",mandatory:true}]},form_data:{requirement_checks:{ktp:true,kk:true}},snapshot:{requirements,form_data:{requirement_checks:{ktp:true}}}});
  assert.deepEqual(detail.missing.map(r=>r.label),["Kartu Keluarga","Surat pendukung"]);
  assert.equal(detail.source,"snapshot");
 }
});
