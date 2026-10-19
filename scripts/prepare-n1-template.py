"""Map N1 slots without rebuilding the supplied document package."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from lxml import etree as E
import json, re, sys
SOURCE=Path('D:/IMRON/template/N1.docx')
OUT=Path('templates/nikah.docx')
QA=Path('.data/template-n1')
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
MAP={'kelurahan':'nama_kelurahan','nama_pemohon':'nama','nik_pemohon':'nik','kelamin_pemohon':'jenis_kelamin',
 'tempat_lahir_pemohon':'tempat_lahir','tanggal_lahir_pemohon':'tanggal_lahir','agama_pemohon':'agama',
 'pekerjaan_pemohon':'pekerjaan','alamat_pemohon':'alamat','rt_pemohon':'rt','rw_pemohon':'rw',
 'taempat_lahir_ibu':'tempat_lahir_ibu','status_jika_laki-laki':'istri_ke_n1','status_jika_perempuan':'status_perempuan_n1',
 'jabatan':'jabatan_penandatangan','nama_pejabat':'nama_penandatangan','nip_pejabat':'nip_penandatangan'}
QA.mkdir(parents=True,exist_ok=True)
digest=sha256(SOURCE.read_bytes()).hexdigest()
with ZipFile(SOURCE) as source:
 root=E.fromstring(source.read('word/document.xml'))
 paragraphs=root.findall('.//w:p',NS)
 parts={n:{'sha256':sha256(source.read(n)).hexdigest(),'size':len(source.read(n)),'policy':'editable' if n in ('word/document.xml','word/_rels/settings.xml.rels') else 'preserve-only'} for n in source.namelist()}
 slots=[{'paragraph':i,'slots':re.findall(r'\{([^}]+)\}',''.join(p.xpath('.//w:t/text()',namespaces=NS)))} for i,p in enumerate(paragraphs)]
 if '--inspect' in sys.argv:
  (QA/'inventory.json').write_text(json.dumps({'source_sha256':digest,'parts':parts,'slots':slots},indent=2),encoding='utf8')
  (QA/'artifact.md').write_text(f'''# N1 template contract
Reference {SOURCE}; SHA-256 {digest}. One A4 portrait section; source renders two pages with signature on page 2. Render evidence reference-render; inventory.json lists every slot by paragraph index and every package part hash.
Page: 11906 x 16838 twips; margins top 426, bottom 1440, left 1276, right 1043; header/footer 720, column spacing 720, grid 360. Preserve source paragraph/run styles, fonts, sizes, tab stops, indents, numbering, spacing, header metadata, Model N1 label and signature placement. Use original styles.xml and all other parts unchanged.
Flow: legal-reference heading retained as supplied (no legal verification asserted), Model N1, office identity, title/number, applicant, sex-specific marital status, father, mother, declaration, signature.
Editable slots: map all brace placeholders in word/document.xml to application dollar-brace placeholders. Applicant identity/village/official comes from snapshots; nationality, status and 16 father/mother fields are entered by operator. Fix misspelled taempat_lahir_ibu key. Other metadata optional: jabatan_detail and internal catatan.
Status paragraph 25: replace static Jejaka, Duda with status_laki_laki_n1. Paragraph 26: remove placeholder ellipsis after ke, retain wife-order label and use istri_ke_n1. Paragraph 27: remove static Perawan, Janda and second colon, leaving source tabs, Perempuan label and selected status_perempuan_n1. Inapplicable status and wife order display dash. Positive integer wife order required only for Beristri. No unrelated prose or tables changed.
Remove 15 empty legacy MERGEFIELD instructions and their field delimiters; application slots replace those fields. Preserve their empty runs and source address punctuation. Source and every part except word/document.xml must remain byte-identical. Section, paragraph, numbering, table and drawing structures preserved. Match the companion statement's more open line rhythm while removing only redundant blank paragraphs so the signature remains on page 1. Verify all placeholders and source hash; render representative filled N1 and inspect the single page.
''',encoding='utf8')
  print('N1 inventory and contract saved.'); sys.exit(0)
 assert json.loads((QA/'inventory.json').read_text())['source_sha256']==digest
 for i,p in enumerate(paragraphs):
  nodes=p.findall('.//w:t',NS); text=''.join(n.text or '' for n in nodes)
  changes=[(m.start(),m.end(),'${'+MAP.get(m.group(1),m.group(1))+'}') for m in re.finditer(r'\{([^}]+)\}',text)]
  fixes=[]
  if i==25: fixes=[('Jejaka, Duda','${status_laki_laki_n1}')]
  if i==26: fixes=[('\u2026','')]
  if i==27: fixes=[('Perawan, Janda: ','')]
  for old,new in fixes:
   assert old in text,(i,text)
   start=text.index(old); changes.append((start,start+len(old),new))
  for start,end,value in sorted(changes,reverse=True):
   offset=0
   for node in nodes:
    old=node.text or ''; a,b=offset,offset+len(old); offset=b
    if b<=start or a>=end: continue
    node.text=old[:max(0,start-a)]+(value if a<=start<b else '')+old[max(0,end-a):]
    node.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
 for instruction in root.findall('.//w:instrText',NS):
  assert (instruction.text or '').strip().startswith('MERGEFIELD ')
  instruction.getparent().remove(instruction)
 for field in root.findall('.//w:fldChar',NS): field.getparent().remove(field)
 # Match the readable line rhythm of the new companion statement with a
 # modest increase over the source, while retaining typography, tabs and layout. The
 # source already provides the section gaps needed to keep N1 on one page.
 for p in paragraphs:
  if not ''.join(p.xpath('.//w:t/text()',namespaces=NS)).strip():
   continue
  ppr = p.find('./w:pPr',NS)
  if ppr is None:
   ppr = E.Element('{%s}pPr' % NS['w']); p.insert(0,ppr)
  spacing = ppr.find('./w:spacing',NS)
  if spacing is None:
   spacing = E.SubElement(ppr,'{%s}spacing' % NS['w'])
  spacing.set('{%s}line' % NS['w'],'250')
  spacing.set('{%s}lineRule' % NS['w'],'auto')
  spacing.set('{%s}after' % NS['w'],'0')
 # User requested the signature block to fit on the first page; remove blank
 # paragraphs before and after that block so no trailing blank page remains.
 for i in [39,41,50,52,56,57,58,59,62,63,64,65]:
  paragraphs[i].getparent().remove(paragraphs[i])
 settings_rels = E.fromstring(source.read('word/_rels/settings.xml.rels'))
 for relationship in list(settings_rels):
  if relationship.get('TargetMode') == 'External': settings_rels.remove(relationship)
 with ZipFile(OUT,'w') as target:
  for part in source.infolist():
   if part.filename=='word/document.xml': content=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
   elif part.filename=='word/_rels/settings.xml.rels': content=E.tostring(settings_rels,xml_declaration=True,encoding='UTF-8',standalone=True)
   else: content=source.read(part.filename)
   target.writestr(part,content)
with ZipFile(OUT) as result:
 for name,entry in parts.items():
  if entry['policy']=='preserve-only': assert sha256(result.read(name)).hexdigest()==entry['sha256'],name
assert sha256(SOURCE.read_bytes()).hexdigest()==digest
print('N1 template adapted; original and preserve-only parts unchanged.')

