"""Adapt only placeholder text in the supplied DOCX; keep source package intact."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json, re, sys
from lxml import etree as E

SOURCE = Path('D:/IMRON/template/Belum Memiliki Rumah.docx')
OUT = Path('templates/belum-memiliki-rumah.docx')
QA = Path('.data/template-rumah')
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
MAP = {
 'kelurahan':'${nama_kelurahan}', 'nama_pemohon':'${nama}',
 'nik_pemohon':'${nik}', 'kelamin_pemohon':'${jenis_kelamin}',
 'perkawinan':'${status_perkawinan}', 'kecamatan':'${nama_kecamatan}',
 'kota_kabupaten':'${kabupaten_kota}', 'peruntukan':'${keperluan}',
 'jabatan':'${jabatan_penandatangan}', 'nama_pejabat':'${nama_penandatangan}',
 'nip_pejabat':'${nip_penandatangan}',
 'pengantar_rt':'Nomor ${nomor_pengantar_rt} tanggal ${tanggal_pengantar_rt}',
}
QA.mkdir(parents=True,exist_ok=True)
digest = sha256(SOURCE.read_bytes()).hexdigest()
with ZipFile(SOURCE) as source:
    original = source.read('word/document.xml')
    root = E.fromstring(original)
    parts = {n:{'size':len(source.read(n)), 'sha256':sha256(source.read(n)).hexdigest(), 'policy':'editable' if n=='word/document.xml' else 'preserve-only'} for n in source.namelist()}
    paragraphs = root.findall('.//w:p',NS)
    slots = [{'paragraph':i,'placeholders':re.findall(r'\$\{([^}]+)\}', ''.join(p.xpath('.//w:t/text()',namespaces=NS)))} for i,p in enumerate(paragraphs)]
    if '--inspect' in sys.argv:
        (QA/'inventory.json').write_text(json.dumps({'source_sha256':digest,'parts':parts,'slots':slots},indent=2),encoding='utf8')
        (QA/'artifact.md').write_text(f'''# Template Surat Keterangan Belum Memiliki Rumah
Reference: {SOURCE}; SHA-256: {digest}. One A4 portrait page, one section.
Evidence: reference-render/page-1.png, style-evidence.json, inventory.json.
Page: 11907 x 16839 twips; margins top 0, left/right 1440, bottom 562; header/footer 720; column spacing 101; grid 360.
Design authority is the original DOCX. Preserve all paragraph/run properties, tabs, spacing, Arial body and Tahoma letterhead, source sizes, title underline, bold/italic ownership declaration, logo anchor and double rule, signature table and blank signing space.
Flow: Tangerang/Cibodas letterhead, title and number, introduction, resident particulars, ownership declaration and RT reference, purpose, closing, date/signature.
Slot locators and package hash inventory: inventory.json. Only word/document.xml is editable. Preserve every other ZIP part byte-for-byte, including images, relationships, styles, numbering, custom XML, foot/endnotes, settings and metadata.
Editable slots: map the source placeholders to application fields using MAP in prepare-rumah-template.py. Kewarganegaraan and purpose are required; RT reference number/date and additional position detail are optional. Per the user's update, replace the whole RT reference clause with keterangan_pengantar_rt: empty number removes the clause and its date; populated number renders Nomor: followed by the number and the date when supplied. Automatic slots use existing immutable resident/village/official snapshot and numbering. Retain static Tangerang/Cibodas text and all other source prose.
Remove the two empty legacy MERGEFIELD fields KEPERLUAN and PANGKAT_PEJABAT, which have no cached displayed result. Purpose already maps to keperluan; do not invent an official rank. Preserve visible spacing and run formatting.
Fidelity gate: unchanged source hash and all preserve-only parts, identical section geometry, original letterhead/logo/typography, no unresolved placeholders in populated sample, one page for representative input, inspect populated render plus app preview. Placeholder-only render may wrap because slot names exceed populated values.
''',encoding='utf8')
        print('Template inventory and artifact contract saved.')
        sys.exit(0)
    assert json.loads((QA/'inventory.json').read_text())['source_sha256']==digest
    reference_count=0
    for p in paragraphs:
        nodes=p.findall('.//w:t',NS)
        text=''.join(n.text or '' for n in nodes)
        reference=' serta berdasarkan Surat Keterangan Ketua dari RT.${rt} RW.${rw} ${pengantar_rt}'
        span=(text.index(reference), text.index(reference)+len(reference)) if reference in text else None
        replacements=[(m.start(),m.end(),MAP[m.group(1)]) for m in re.finditer(r'\$\{([^}]+)\}',text) if m.group(1) in MAP and not (span and span[0]<=m.start()<span[1])]
        if span:
            replacements.append((*span,'${keterangan_pengantar_rt}'))
            reference_count+=1
        replacements.sort()
        for start,end,value in reversed(replacements):
            offset=0
            for node in nodes:
                old=node.text or ''; a,b=offset,offset+len(old); offset=b
                if b<=start or a>=end: continue
                node.text=old[:max(0,start-a)]+(value if a<=start<b else '')+old[max(0,end-a):]
                node.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
        for instruction in p.findall('.//w:instrText',NS):
            assert (instruction.text or '').strip() in ['MERGEFIELD KEPERLUAN','MERGEFIELD "PANGKAT_PEJABAT"']
            instruction.getparent().remove(instruction)
        for field in p.findall('.//w:fldChar',NS):
            field.getparent().remove(field)
    assert reference_count==1, 'Expected exactly one RT reference clause'
    OUT.parent.mkdir(exist_ok=True)
    with ZipFile(OUT,'w') as target:
        for part in source.infolist():
            target.writestr(part, E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True) if part.filename=='word/document.xml' else source.read(part.filename))
with ZipFile(OUT) as result:
    for name,entry in parts.items():
        if entry['policy']=='preserve-only': assert sha256(result.read(name)).hexdigest()==entry['sha256'],name
assert sha256(SOURCE.read_bytes()).hexdigest()==digest
print('Adapted DOCX saved; source and every preserve-only package part verified unchanged.')
