"""Preserve the supplied SKU package and adapt its application slots in place."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from lxml import etree as E
import json, re, sys

SOURCE = Path('D:/IMRON/template/SKU.docx')
OUT = Path('templates/usaha.docx')
QA = Path('.data/template-sku')
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
MAP = {
    'kelurahan': 'nama_kelurahan', 'nama_pemohon': 'nama',
    'nik_pemohon': 'nik', 'kelamin_pemohon': 'jenis_kelamin',
    'perkawinan': 'status_perkawinan', 'kecamatan': 'nama_kecamatan',
    'kota_kabupaten': 'kabupaten_kota', 'peruntukan': 'keperluan',
    'jabatan': 'jabatan_penandatangan', 'nama_pejabat': 'nama_penandatangan',
    'nip_pejabat': 'nip_penandatangan',
}
QA.mkdir(parents=True, exist_ok=True)
digest = sha256(SOURCE.read_bytes()).hexdigest()
with ZipFile(SOURCE) as source:
    root = E.fromstring(source.read('word/document.xml'))
    paragraphs = root.findall('.//w:p', NS)
    parts = {k: {'sha256': sha256(source.read(k)).hexdigest(), 'size': len(source.read(k)),
                 'policy': 'editable' if k == 'word/document.xml' else 'preserve-only'} for k in source.namelist()}
    slots = [{'paragraph': i, 'slots': re.findall(r'\$\{([^}]+)\}', ''.join(p.xpath('.//w:t/text()', namespaces=NS)))} for i, p in enumerate(paragraphs)]
    if '--inspect' in sys.argv:
        (QA/'inventory.json').write_text(json.dumps({'source_sha256': digest, 'parts': parts, 'slots': slots}, indent=2), encoding='utf8')
        (QA/'artifact.md').write_text(f'''# SKU template contract
Reference: {SOURCE}, SHA-256 {digest}. Reference render: reference-render/page-1.png.
One A4 portrait page, one section: 11907 x 16839 twips. Margins top 0, left/right 1440, bottom 562, header/footer 720, column gap 101, grid 360.
Reference controls typography: retain Tahoma letterhead, Arial body, all original run sizes/bold/underline, tabs, indents, paragraph spacing, double rule and logo anchor. Retain signature table geometry and original blank signing space.
Flow: letterhead, SURAT KETERANGAN title and number, introduction, resident identity, business declaration with business identity/address, closing, signature. Title retained exactly as supplied.
Slot locators and package inventory: inventory.json. Only word/document.xml may change. Every other package part, including styles, numbering, drawings, relationships and custom XML, remains byte-identical.
Resident/village/official fields map via MAP. Nationality, jenis_usaha, nama_usaha, alamat_usaha, rt_usaha, rw_usaha, kel_usaha, kec_usaha, kota_kabupaten_usaha are required operator input. Business address is independent of resident address. Optional fields: RT reference number/date, jabatan_detail, internal catatan (not printed). Source has no purpose field; do not add one.
At paragraph 24 replace only 'keterangan Ketua RT.' through pengantar_rt plus ' dan ' with keterangan_pengantar_rt. Preserve preceding 'berdasarkan ' and following 'pengakuan'. Populated reference prints Nomor: followed by number and optional localized date, ending with ' dan '. Empty number removes the reference and conjunction, leaving 'berdasarkan pengakuan'. Other declaration wording remains unchanged.
Remove only legacy empty MERGEFIELD PANGKAT_PEJABAT instruction and field delimiters, preserving visible runs. No other source text or layout changes.
Verify original hash and all preserve-only parts, original section/paragraph/table/drawing properties, actual merge without remaining slots, business data separate from resident data, optional reference cases, and one clean rendered page with complete signature.
''', encoding='utf8')
        print('SKU inventory and contract saved.'); sys.exit(0)
    assert json.loads((QA/'inventory.json').read_text())['source_sha256'] == digest
    reference = 'keterangan Ketua RT.${rt} RW.${rw} ${pengantar_rt} dan '
    count = 0
    for p in paragraphs:
        nodes = p.findall('.//w:t', NS)
        text = ''.join(n.text or '' for n in nodes)
        span = (text.index(reference), text.index(reference) + len(reference)) if reference in text else None
        changes = [(m.start(), m.end(), '${'+MAP[m.group(1)]+'}') for m in re.finditer(r'\$\{([^}]+)\}', text)
                   if m.group(1) in MAP and not (span and span[0] <= m.start() < span[1])]
        if span:
            changes.append((*span, '${keterangan_pengantar_rt}')); count += 1
        for start, end, value in sorted(changes, reverse=True):
            offset = 0
            for node in nodes:
                old = node.text or ''; a, b = offset, offset+len(old); offset = b
                if b <= start or a >= end: continue
                node.text = old[:max(0,start-a)] + (value if a <= start < b else '') + old[max(0,end-a):]
                node.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        for instruction in p.findall('.//w:instrText', NS):
            assert (instruction.text or '').strip() in ['MERGEFIELD KEPERLUAN', 'MERGEFIELD "PANGKAT_PEJABAT"']
            instruction.getparent().remove(instruction)
        for field in p.findall('.//w:fldChar', NS): field.getparent().remove(field)
    assert count == 1
    with ZipFile(OUT, 'w') as target:
        for part in source.infolist():
            target.writestr(part, E.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True) if part.filename == 'word/document.xml' else source.read(part.filename))
with ZipFile(OUT) as result:
    for name, entry in parts.items():
        if entry['policy'] == 'preserve-only': assert sha256(result.read(name)).hexdigest() == entry['sha256'], name
assert sha256(SOURCE.read_bytes()).hexdigest() == digest
print('SKU adapted; source and all preserve-only parts unchanged.')
