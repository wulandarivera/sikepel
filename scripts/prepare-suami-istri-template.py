"""Preserve the supplied package and map its text slots to SIKEPEL."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from lxml import etree as E
import json, re, sys

SOURCE = Path('D:/IMRON/template/Keterangan Suami Istri.docx')
OUT = Path('templates/suami-istri.docx')
QA = Path('.data/template-suami-istri')
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
MAP = {'kelurahan':'nama_kelurahan', 'peruntukan':'keperluan',
       'jabatan':'jabatan_penandatangan', 'nama_pejabat':'nama_penandatangan',
       'nip_pejabat':'nip_penandatangan'}
REFERENCE = 'berdasarkan surat pengantar RT RW {pengantar_rt} '
QA.mkdir(parents=True, exist_ok=True)
digest = sha256(SOURCE.read_bytes()).hexdigest()
with ZipFile(SOURCE) as source:
    root = E.fromstring(source.read('word/document.xml'))
    paragraphs = root.findall('.//w:p', NS)
    parts = {n: {'size':len(source.read(n)), 'sha256':sha256(source.read(n)).hexdigest(),
                 'policy':'editable' if n == 'word/document.xml' else 'preserve-only'} for n in source.namelist()}
    slots = [{'paragraph':i, 'slots':re.findall(r'\{([^}]+)\}', ''.join(p.xpath('.//w:t/text()', namespaces=NS)))} for i,p in enumerate(paragraphs)]
    if '--inspect' in sys.argv:
        (QA/'inventory.json').write_text(json.dumps({'source_sha256':digest, 'parts':parts, 'slots':slots},indent=2),encoding='utf8')
        (QA/'artifact.md').write_text(f'''# Keterangan Suami Istri template contract
Reference: {SOURCE}; SHA-256 {digest}. One portrait A4 page and one section.
Evidence: reference-render/page-1.png, inventory.json, style-evidence.json.
Page system: 11907 x 16839 twips; margins top 0, bottom 562, left/right 1440; header/footer 720; column spacing 101; grid 360.
Preserve all paragraph/run properties, body Arial and letterhead Tahoma, tabs, alignment, spacing, signature table and blank signing space. Keep logo, double rule, underlined uppercase title and bold names. Source controls all exact style values; word/styles.xml is preserve-only.
Flow: letterhead, title/number, introduction, husband identity, wife identity, religious marriage declaration/date/certificate explanation, purpose, closing, official signature.
Slot map and stable locators are paragraph indices in inventory.json within word/document.xml. Convert source braces to application dollar-brace slots; map common village/official/purpose slots. Husband and wife each have 12 required editable fields; dates are localized by application. Archive applicant identity remains the selected resident. Form defaults may copy this resident only to the matching gender; no spouse identity is invented.
Optional RT number/date: replace the entire REFERENCE phrase in paragraph 31 with keterangan_pengantar_rt. A blank number removes this phrase; populated reference uses Nomor: and an optional date. Existing preceding comma and following declaration remain.
Intentional text corrections: menerangkanbahwa -> menerangkan bahwa, untukdipergunakan -> untuk dipergunakan, tanggal. -> tanggal. Replace Kota followed by each city slot with the full city/kabupaten slot to avoid duplicate Kota and support administrative names stored in the app. Retain fixed Tangerang/Cibodas letterhead, marriage location kelurahan, and all other prose.
Package fidelity: only word/document.xml editable; every other part, relationship, drawing, style, custom XML, field and metadata is preserve-only with inventory hashes. Preserve paragraph and section counts and all tables. No content controls or fields require replacement. Source stays byte-for-byte unchanged.
Gate: validate all slots, required partner fields, localized dates and optional RT reference; compare all preserve-only hashes/geometry; render and inspect every populated page and actual browser PDF for clipping/overlap.
''',encoding='utf8')
        print('Reference inventory and artifact contract saved.')
        sys.exit(0)
    assert json.loads((QA/'inventory.json').read_text())['source_sha256'] == digest
    reference_count = 0
    for p in paragraphs:
        nodes = p.findall('.//w:t',NS)
        text = ''.join(n.text or '' for n in nodes)
        replacements = []
        span = (text.index(REFERENCE),text.index(REFERENCE)+len(REFERENCE)) if REFERENCE in text else None
        for m in re.finditer(r'\{([^}]+)\}',text):
            if span and span[0] <= m.start() < span[1]: continue
            replacements.append((m.start(),m.end(),'${'+MAP.get(m.group(1),m.group(1))+'}'))
        if span:
            replacements.append((*span,'${keterangan_pengantar_rt}'))
            reference_count += 1
        for old,new in [('menerangkanbahwa','menerangkan bahwa'),('untukdipergunakan','untuk dipergunakan'),('tanggal. ','tanggal '),('Kota {kota_suami}','${kota_suami}'),('Kota {kota_istri}','${kota_istri}')]:
            if old in text:
                a=text.index(old); b=a+len(old)
                replacements=[item for item in replacements if not (a<=item[0]<b)]
                replacements.append((a,b,new))
        for start,end,value in sorted(replacements,reverse=True):
            offset=0
            for node in nodes:
                old=node.text or ''; a,b=offset,offset+len(old); offset=b
                if b<=start or a>=end: continue
                node.text=old[:max(0,start-a)]+(value if a<=start<b else '')+old[max(0,end-a):]
                node.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
    assert reference_count == 1
    with ZipFile(OUT,'w') as target:
        for part in source.infolist():
            target.writestr(part,E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True) if part.filename=='word/document.xml' else source.read(part.filename))
with ZipFile(OUT) as result:
    for name,entry in parts.items():
        if entry['policy']=='preserve-only': assert sha256(result.read(name)).hexdigest()==entry['sha256'],name
assert sha256(SOURCE.read_bytes()).hexdigest()==digest
print('Adapted template saved; source and preserve-only package parts unchanged.')
