"""Preserve the supplied F-1.02 package; bind its existing slots to SIKEPEL."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
from lxml import etree as E
import json,re,sys
src=Path('D:/IMRON/template/F-102.docx'); out=Path('templates/ktp.docx'); qa=Path('.data/template-ktp');qa.mkdir(exist_ok=True,parents=True)
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','pic':'http://schemas.openxmlformats.org/drawingml/2006/picture','v':'urn:schemas-microsoft-com:vml'}
W='{'+ns['w']+'}'
with ZipFile(src) as z:
 root=E.fromstring(z.read('word/document.xml'))
 digest=sha256(src.read_bytes()).hexdigest()
 parts={n:sha256(z.read(n)).hexdigest() for n in z.namelist()}
 if '--inspect' in sys.argv:
  (qa/'inventory.json').write_text(json.dumps({'sha256':digest,'parts':parts},indent=2))
  (qa/'artifact.md').write_text(f'''# F-1.02 KTP template
Source {src}, SHA256 {digest}. One Legal portrait page (12240 x 20160 twips), two continuous sections, 11 tables including DrawingML/VML text box alternatives. Margins 360 left/right, 460 top, 274 bottom (verify exact sectPr remains byte-equivalent structurally). Retain original Arial Narrow/TNR font properties, table widths/heights, anchored text boxes, header, images, borders and signature space. Source reference render: reference-render/page-1.png. Preserve-only hashes in inventory.json.
Only word/document.xml is editable. All other parts including 17 images, relationships, styles, settings and header are preserved byte-for-byte. Original retained file never edited.
Slots: both alternatives of applicant data boxes map nama, nik, nomor_kk->no_kk, nomor_handphone, email. Bottom signature replaces malformed {{nama}} with ${{nama}}; staff dotted name replaced by ${{nama_petugas}}. Date line uses ${{tanggal_surat}} and retains Kota Tangerang. No government letterhead, surat number or lurah block is added to this standard form; numbering stays in the application archive.
KTP request marks: main service table (table index 3) row/cell coordinates (1,2) A; (3,2) B; (5,2) C; (6,2) 1; (7,2) 2; (9,2) D; (11,2) E; (12,2) F; (14,2) G; (3,6) B under Perubahan Data. Replace only text in these cells, using circled characters for selected choices.
Attachment marks: original drawing 17 picture objects: picture0 is check example, 1 is right first item, 2 is left first item, 3-9 are left remaining items, 10-16 are right remaining items. Add descriptive marker to cNvPr and VML alternatives. At merge time selected markers reuse the original rId7 check image; unselected circles and every anchor/size remain. Actual checkboxes require explicit user selection; no attachment is inferred.
Fidelity gates: all source hashes except document.xml unchanged; identical sections, tables and drawings. Render populated forms for different choices, verify names/NIK/KK and marks, one Legal page, no residual tokens. Verify app preview and print use the PDF paper size.
''',encoding='utf8'); print('F-102 layout contract saved.');sys.exit()
 assert json.loads((qa/'inventory.json').read_text())['sha256']==digest
 for p in root.findall('.//w:p',ns):
  nodes=[t for t in p.findall('.//w:t',ns) if t.xpath('ancestor::w:p[1]',namespaces=ns)[0] is p]
  text=''.join(t.text or '' for t in nodes)
  replacements=[]
  for old,new in [('${nomor_kk}','${no_kk}'),('( {nama} )','( ${nama} )'),('(...................................)','( ${nama_petugas} )')]:
   for m in re.finditer(re.escape(old),text):replacements.append((m.start(),m.end(),new))
  if text.startswith('Kota Tangerang,'):
   replacements=[(0,len(text),'Kota Tangerang, ${tanggal_surat}')]
  for start,end,new in sorted(replacements,reverse=True):
   offset=0
   for n in nodes:
    old=n.text or '';a,b=offset,offset+len(old);offset=b
    if b<=start or a>=end:continue
    n.text=old[:max(0,start-a)]+(new if a<=start<b else '')+old[max(0,end-a):]
    n.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
 table=root.findall('.//w:tbl',ns)[3]
 for row,col,key in [(1,2,'a'),(3,2,'b'),(5,2,'c'),(6,2,'hilang'),(7,2,'rusak'),(9,2,'d'),(11,2,'e'),(12,2,'f'),(14,2,'g'),(3,6,'perubahan')]:
  cell=table.findall('./w:tr',ns)[row].findall('./w:tc',ns)[col]; texts=cell.findall('.//w:t',ns)
  texts[0].text='${f102_'+key+'}'
  for t in texts[1:]:t.text=''
  run=texts[0].getparent();pr=run.find('./w:rPr',ns)
  if pr is None:pr=E.SubElement(run,W+'rPr');run.insert(0,pr)
  fonts=pr.find('./w:rFonts',ns)
  if fonts is None:fonts=E.SubElement(pr,W+'rFonts')
  for f in ['ascii','hAnsi','cs']:fonts.set(W+f,'Segoe UI Symbol')
 left=['kk','nikah','cerai','pindah','pindah_ln','ktp','paspor','hilang']
 right=['perubahan','sptjm','kematian','pernyataan','perwakilan','keluarga','pengasuhan','izin_tinggal']
 pictures=root.findall('.//pic:pic',ns);assert len(pictures)==17
 for pic,key in zip(pictures[1:],[right[0],left[0],*left[1:],*right[1:]]):
  pic.find('.//pic:cNvPr',ns).set('descr','sikepel-f102:lampiran_'+key)
 fallback=root.findall('.//v:imagedata',ns);assert len(fallback)==14
 for img,key in zip(fallback,[*left[1:],*right[1:]]):img.getparent().set('alt','sikepel-f102:lampiran_'+key)
 with ZipFile(out,'w') as target:
  for part in z.infolist():target.writestr(part,E.tostring(root,encoding='UTF-8',xml_declaration=True,standalone=True) if part.filename=='word/document.xml' else z.read(part.filename))
with ZipFile(out) as z:
 for n,h in parts.items():
  if n!='word/document.xml':assert sha256(z.read(n)).hexdigest()==h
assert sha256(src.read_bytes()).hexdigest()==digest
print('F-102 adapted; all preserve-only parts and original file unchanged.')
