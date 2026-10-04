"""Preserve the supplied UMUM package and adapt its application slots in place."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from lxml import etree as E
import json, re, sys

SOURCE = Path('D:/IMRON/template/UMUM.docx')
OUT = Path('templates/umum.docx')
QA = Path('.data/template-umum')
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
    slots = [{'paragraph': i, 'slots': re.findall(r'\{([^}]+)\}', ''.join(p.xpath('.//w:t/text()', namespaces=NS)))} for i, p in enumerate(paragraphs)]
    if '--inspect' in sys.argv:
        (QA/'inventory.json').write_text(json.dumps({'source_sha256': digest, 'parts': parts, 'slots': slots}, indent=2), encoding='utf8')
        (QA/'artifact.md').write_text(f'''# UMUM template contract
Reference: {SOURCE}, SHA-256 {digest}. Reference render: reference-render/page-1.png.
One A4 portrait page, one section: 11907 x 16839 twips. Margins top 0, left/right 1440, bottom 562, header/footer 720, column gap 101, grid 360.
Reference controls typography: retain Tahoma letterhead, Arial body, all original run sizes/bold/underline, tabs, indents, paragraph spacing, double rule and logo anchor. Retain signature table geometry and original blank signing space.
Flow: letterhead, SURAT KETERANGAN title and number, introduction, resident identity, residence declaration, purpose, closing, signature. Keep source wording and title exactly.
Slot locators and package inventory: inventory.json. Only word/document.xml may change. All other parts including styles, numbering, image, relationships, footnotes, endnotes and custom XML remain byte-identical. No external relationships.
Normalize source single-brace slots into application dollar-brace slots. MAP handles aliases for resident/village/official/purpose. Required operator input: negara and keperluan. Optional input: RT number/date, jabatan_detail, catatan (internal, never printed).
Paragraph 24: replace comma plus based-on-reference clause through pengantar_rt with keterangan_pengantar_rt. Keep following comma and residence declaration. With no reference number, remove entire reference clause, leaving the residency statements joined by the original comma. With a number, print Nomor: plus trimmed number and optional localized date.
Remove legacy MERGEFIELD NO_SURAT_RT, KEPERLUAN and PANGKAT_PEJABAT instructions and delimiters; retain visible slot runs. Preserve geometry, paragraph and run formatting, signature table, anchored logo and empty signing paragraphs.
Check every alias is filled with no braces/merge instructions, no invented declaration, no internal notes. Verify required fields and empty, whitespace, number-only and dated reference. Compare page layout with retained reference and inspect all rendered pages; ordinary fixture must fit one page with signature.
''', encoding='utf8')
        print('UMUM inventory and contract saved.'); sys.exit(0)
    assert json.loads((QA/'inventory.json').read_text())['source_sha256'] == digest
    reference = ', berdasarkan surat keterangan/pengantar dari Ketua RT.{rt} RW.{rw} {pengantar_rt}'
    count = 0
    for p in paragraphs:
        nodes = p.findall('.//w:t', NS)
        text = ''.join(n.text or '' for n in nodes)
        span = (text.index(reference), text.index(reference) + len(reference)) if reference in text else None
        changes = [(m.start(), m.end(), '${'+MAP.get(m.group(1), m.group(1))+'}') for m in re.finditer(r'\{([^}]+)\}', text)
                   if not (span and span[0] <= m.start() < span[1])]
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
            assert (instruction.text or '').strip() in ['MERGEFIELD NO_SURAT_RT', 'MERGEFIELD KEPERLUAN', 'MERGEFIELD "PANGKAT_PEJABAT"']
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
print('UMUM adapted; source and all preserve-only parts unchanged.')
