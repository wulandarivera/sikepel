import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Document,Packer,Paragraph} from 'docx';
import {LocalStorage} from './src/server/storage';
import {LibreOfficeConverter} from './src/server/documents';


async function main(){
 const result:any={};
 const storage=new LocalStorage();const bytes=Buffer.from('SIK08 synthetic storage only');
 await storage.put('sik08/synthetic.txt',bytes);assert.deepEqual(await storage.get('sik08/synthetic.txt'),bytes);
 result.storage='PASS';
 try {const doc=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('SIK08 synthetic PDF only')]}]}));
 const pdf=await new LibreOfficeConverter().convert(doc);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');result.pdf='PASS';result.pdf_bytes=pdf.length;
 }catch{result.pdf='FAIL';}
 await fs.writeFile('/fixture/storage-pdf-evidence.json',JSON.stringify(result));
 if(result.pdf!=='PASS')process.exitCode=1;
}
main().catch(()=>{console.error('synthetic assertion failed; details suppressed');process.exitCode=1;});
