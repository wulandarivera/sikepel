"""Preserve the supplied SKTM package and adapt its application slots in place."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from lxml import etree as E
import json, re, sys

SOURCE = Path('D:/IMRON/template/SKTM.docx')
OUT = Path('templates/tidak-mampu.docx')
QA = Path('.data/template-sktm')
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
        (QA/'artifact.md').write_text(f'''# SKTM template contract
Reference: {SOURCE}, SHA-256 {digest}. Reference render: dtsen-reference-render/page-1.png.
One A4 portrait page and one section; 11907 x 16839 twips. Margins top 0, right/left 1440, bottom 562, header/footer 720; column gap 101, grid 360.
The reference DOCX governs all typography, run properties, paragraph spacing, tabs, indents, signature table geometry and blank signing space. Keep its Tahoma letterhead, Arial body, original font sizes, logo drawing and double rule, underlined SURAT KETERANGAN heading and bold applicant/purpose/signatory slots.
Flow: Tangerang/Cibodas letterhead, title/number, introduction, resident identity, residence declaration with optional RT reference and fixed DTSEN category sentence, purpose, closing, date and signatory.
inventory.json identifies all editable slots by paragraph index and all package parts with hashes. Only word/document.xml may change; all other package parts, relationships, images, styles, settings and metadata are preserve-only.
Map the slots listed by MAP in prepare-sktm-template.py; keep other application slots. Nationality, category desil DTSEN and purpose are required input. Desil is entered by the operator, never inferred from income. Preserve the entire new DTSEN sentence in paragraph 24, with its category slot. The old condition narrative slot has been removed by the user; remove its form field. Resident, village and official data come from the same snapshot as the letter number/date. Internal notes do not print. No income requirement remains because the supplied document has no income slot.
In paragraph 24 replace the clause beginning ', berdasarkan keterangan Ketua RT.' up to pengantar_rt with keterangan_pengantar_rt. Empty RT number removes the whole clause; supplied number prints Nomor: plus its value and optional localized date. Preserve the subsequent comma and residence statement.
Remove only the empty legacy MERGEFIELD KEPERLUAN and PANGKAT_PEJABAT instructions and delimiters. Preserve displayed values and their run structure. All other text and geometry remain unchanged.
Fidelity gates: source hash and all preserve-only package hashes unchanged; no unresolved slots; actual populated examples and application preview render one clean page with complete signature area. Verify populated and absent RT references and require a nonblank desil. Keep the snapshot formatter leading space for desil by removing only the space immediately before its placeholder in the new template.
''', encoding='utf8')
        print('SKTM inventory and contract saved.'); sys.exit(0)
    assert json.loads((QA/'inventory.json').read_text())['source_sha256'] == digest
    reference = ', berdasarkan keterangan Ketua RT.${rt} RW.${rw} ${pengantar_rt}'
    count = 0
    for p in paragraphs:
        nodes = p.findall('.//w:t', NS)
        text = ''.join(n.text or '' for n in nodes)
        span = (text.index(reference), text.index(reference) + len(reference)) if reference in text else None
        changes = [(m.start(), m.end(), '${'+MAP[m.group(1)]+'}') for m in re.finditer(r'\$\{([^}]+)\}', text)
                   if m.group(1) in MAP and not (span and span[0] <= m.start() < span[1])]
        if span:
            changes.append((*span, '${keterangan_pengantar_rt}')); count += 1
        # The formatter includes a separating space only for a populated desil.
        if ' ${desil}' in text:
            start = text.index(' ${desil}')
            changes.append((start, start + len(' ${desil}'), '${desil}'))
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
print('SKTM adapted; source and all preserve-only parts unchanged.')
