"""Preserve the supplied Pindah package and adapt its application slots in place."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from lxml import etree as E
import json, re, sys

SOURCE = Path('D:/IMRON/template/Pindah.docx')
OUT = Path('templates/pindah.docx')
QA = Path('.data/template-pindah')
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
MAP = {
 'no_kk_pemohon':'no_kk', 'nama_pemohon':'nama', 'nik_pemohon':'nik',
 'alamat_asal':'alamat', 'rt_asal':'rt', 'rw_asal':'rw', 'kel_asal':'nama_kelurahan',
 'kec_asal':'nama_kecamatan', 'kota_asal':'kabupaten_kota', 'provinsi_asal':'provinsi',
 'pos_asal':'kode_pos_kelurahan', 'kota/kab_pindah':'kota_pindah',
 'no_hp_pemohon':'nomor_handphone', 'email_pemohon':'email',
 'no_urut_anggota_pindah':'#anggota_pindah}${urut_anggota',
 'nik_anggota_pindah':'nik_anggota', 'nama_anggota_pindah':'nama_anggota',
 'shdk_anggota_pindah':'shdk_anggota}${/anggota_pindah',
}
QA.mkdir(parents=True, exist_ok=True)
digest = sha256(SOURCE.read_bytes()).hexdigest()
with ZipFile(SOURCE) as source:
    root = E.fromstring(source.read('word/document.xml'))
    paragraphs = root.findall('.//w:p', NS)
    parts = {k: {'sha256': sha256(source.read(k)).hexdigest(), 'size': len(source.read(k)),
                 'policy': 'editable' if k in ['word/document.xml', 'word/settings.xml', 'word/_rels/settings.xml.rels'] else 'preserve-only'} for k in source.namelist()}
    slots = [{'paragraph': i, 'slots': re.findall(r'\{([^}]+)\}', ''.join(p.xpath('.//w:t/text()', namespaces=NS)))} for i, p in enumerate(paragraphs)]
    if '--inspect' in sys.argv:
        (QA/'inventory.json').write_text(json.dumps({'source_sha256': digest, 'parts': parts, 'slots': slots}, indent=2), encoding='utf8')
        (QA/'artifact.md').write_text(f'''# Pindah template contract
Reference: {SOURCE}, SHA-256 {digest}. Reference render: reference-render/page-1.png.
Reference has two Legal portrait pages because unfilled placeholders wrap inside narrow numbered-option cells. One section, 12240 x 20160 twips, margins top426 left/right/bottom720, header/footer709, column708, grid360. Source rendering in reference-render/.
Preserve original Arial form font, all sizes, paragraph/run styles, spacing, indents, table and cell geometry, checkbox/number areas, boxed F1.03 top label, title, attention text, three tables and signature area. Letterhead/official letter number is absent; do not add one. Number stays in application archive only.
Flow: F1.03 label/title, attention, identity, application type PINDAH, source address, classification, destination address, reason and family status choices, family member table, unused foreign-resident/overseas sections, acknowledgment and applicant signature/contact.
Slot inventory locators and package hash policy in inventory.json. Edit document.xml plus settings.xml and its relationships only to detach the legacy Excel mail-merge data source; all other package parts remain byte-identical. The application snapshot replaces the source's old spreadsheet connection. Normalize source single braces to application dollar braces. MAP aliases source address to resident and village profile and applicant name/KK/NIK. Destination and choice inputs are required; choices print their numeric codes. Contact optional. No purpose/RT reference/date-of-move slots in domestic section; do not invent them.
Family row in table0 row30: insert loop open before row number in first cell, loop close after SHDK in final cell. Repeat entire original row for each submitted member with automatic row number, NIK, uppercase name and SHDK; preserve all original row/cell styles. This repeated row is the only intentional structural extension.
Legacy MERGEFIELD Kode_Pos1 and NIK instructions removed without changing visible fields or layout. No changes to sections13-20 (foreign resident/overseas), which remain blank as source. Applicant signs; blank Head of Population Office signature line stays blank. Uppercase applicant/member names and destination address; no fabricated names or signatures.
Verify source hash, all preserve-only parts and original styles/geometry, required identity/choices/destination/member validation, multiple member rows and optional contacts. Render merged ordinary and multiple-member fixtures; original narrow choice cells must contain one digit, all values readable, no unresolved braces or unintended blanks. Extra family rows may extend pagination naturally.
''', encoding='utf8')
        print('Pindah inventory and contract saved.'); sys.exit(0)
    assert json.loads((QA/'inventory.json').read_text())['source_sha256'] == digest
    for p in paragraphs:
        nodes = p.findall('.//w:t', NS)
        text = ''.join(n.text or '' for n in nodes)
        changes = [(m.start(), m.end(), '${'+MAP.get(m.group(1), m.group(1))+'}') for m in re.finditer(r'\{([^}]+)\}', text)]
        for start, end, value in sorted(changes, reverse=True):
            offset = 0
            for node in nodes:
                old = node.text or ''; a, b = offset, offset+len(old); offset = b
                if b <= start or a >= end: continue
                node.text = old[:max(0,start-a)] + (value if a <= start < b else '') + old[max(0,end-a):]
                node.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        for instruction in p.findall('.//w:instrText', NS):
            assert (instruction.text or '').strip() in ['MERGEFIELD Kode_Pos1', 'MERGEFIELD NIK']
            instruction.getparent().remove(instruction)
        for field in p.findall('.//w:fldChar', NS): field.getparent().remove(field)
    with ZipFile(OUT, 'w') as target:
        for part in source.infolist():
            data = source.read(part.filename)
            if part.filename == 'word/document.xml':
                data = E.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
            elif part.filename in ['word/settings.xml', 'word/_rels/settings.xml.rels']:
                settings = E.fromstring(data)
                for node in list(settings):
                    if node.tag == '{'+NS['w']+'}mailMerge' or node.get('Type', '').endswith('/mailMergeSource'):
                        settings.remove(node)
                data = E.tostring(settings, xml_declaration=True, encoding='UTF-8', standalone=True)
            target.writestr(part, data)
with ZipFile(OUT) as result:
    for name, entry in parts.items():
        if entry['policy'] == 'preserve-only': assert sha256(result.read(name)).hexdigest() == entry['sha256'], name
assert sha256(SOURCE.read_bytes()).hexdigest() == digest
print('Pindah adapted; source and all preserve-only parts unchanged.')
