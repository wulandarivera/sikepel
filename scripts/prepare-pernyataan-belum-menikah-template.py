"""Adapt the supplied unmarried-statement DOCX without rebuilding its layout."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from lxml import etree as E
import json, re, sys

SOURCE = Path('D:/IMRON/template/Surat Pernyataan Nikah.docx')
OUT = Path('templates/pernyataan-belum-menikah.docx')
QA = Path('.data/template-pernyataan-nikah')
NS = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
MAP = {
 'nama_pemohon':'nama', 'nama_bapak':'nama_bapak', 'tempat_lahir_pemohon':'tempat_lahir',
 'tanggal_lahir_pemohon':'tanggal_lahir', 'negara_pemohon':'negara_pernyataan',
 'agama_pemohon':'agama', 'alamat_pemohon':'alamat', 'rt_pemohon':'rt', 'rw_pemohon':'rw',
 'kelurahan_pemohon':'nama_kelurahan', 'kecamatan_pemohon':'nama_kecamatan',
 'tanggal_surat':'tanggal_surat',
}
QA.mkdir(parents=True,exist_ok=True)
digest = sha256(SOURCE.read_bytes()).hexdigest()
with ZipFile(SOURCE) as source:
 root = E.fromstring(source.read('word/document.xml'))
 paragraphs = root.findall('.//w:p',NS)
 parts = {n:{'sha256':sha256(source.read(n)).hexdigest(),'size':len(source.read(n)), 'policy':'editable' if n=='word/document.xml' else 'preserve-only'} for n in source.namelist()}
 slots = [{'paragraph':i,'slots':re.findall(r'\{([^}]+)\}',''.join(p.xpath('.//w:t/text()',namespaces=NS)))} for i,p in enumerate(paragraphs)]
 if '--inspect' in sys.argv:
  (QA/'companion-inventory.json').write_text(json.dumps({'source_sha256':digest,'parts':parts,'slots':slots},indent=2),encoding='utf8')
  (QA/'companion-artifact.md').write_text(f'''# Surat Pernyataan Belum Pernah Menikah companion template
Reference {SOURCE}; SHA-256 {digest}. One A4 portrait section, one page. Render evidence is reference-render/page-1.png. Preserve source margins (top 993, bottom 1440, left/right 1440), Times New Roman text, underline/bold emphasis, witness lines, signature spacing and paragraph rhythm.
The document is generated only as a companion to an issued N1 and is not a separate menu type. Applicant identity, father name, resident address, village/district, religion and date come from the same immutable N1 snapshot. Nationality comes from the N1 nationality field. Status text is derived from resident gender: Jejaka or Perawan. Keep the legal declaration and witness signature lines from the source.
Map all braces in word/document.xml to application dollar-brace slots using MAP in this script. Only word/document.xml is editable; every other package part remains byte-identical. The source DOCX stays unchanged.
''',encoding='utf8')
  print('Companion inventory and contract saved.'); sys.exit(0)
 assert json.loads((QA/'companion-inventory.json').read_text())['source_sha256']==digest
 for p in paragraphs:
  nodes=p.findall('.//w:t',NS); text=''.join(n.text or '' for n in nodes)
  changes=[(m.start(),m.end(),'${'+MAP.get(m.group(1),m.group(1))+'}') for m in re.finditer(r'\{([^}]+)\}',text)]
  if 'perjaka/Perawan' in text:
   start=text.index('perjaka/Perawan'); changes.append((start,start+len('perjaka/Perawan'),'${status_pernyataan_nikah}'))
  for start,end,value in sorted(changes,reverse=True):
   offset=0
   for node in nodes:
    old=node.text or ''; a,b=offset,offset+len(old); offset=b
    if b<=start or a>=end: continue
    node.text=old[:max(0,start-a)]+(value if a<=start<b else '')+old[max(0,end-a):]
    node.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
 with ZipFile(OUT,'w') as target:
  for part in source.infolist():
   target.writestr(part,E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True) if part.filename=='word/document.xml' else source.read(part.filename))
with ZipFile(OUT) as result:
 for name,entry in parts.items():
  if entry['policy']=='preserve-only': assert sha256(result.read(name)).hexdigest()==entry['sha256'],name
assert sha256(SOURCE.read_bytes()).hexdigest()==digest
print('Companion template adapted; original and preserve-only parts unchanged.')
