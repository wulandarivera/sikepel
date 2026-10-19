import ts from 'typescript';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve('services/whatsapp-gateway');
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
const out=fs.mkdtempSync(path.join(os.tmpdir(),'sik16-parity-'));
try {
 const program=ts.createProgram(parsed.fileNames,{...parsed.options,outDir:out});
 const emitted=program.emit();if(emitted.emitSkipped||ts.getPreEmitDiagnostics(program).some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('Parity compile failed');
 let files=0;const walk=(dir)=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,item.name);if(item.isDirectory())walk(f);else if(item.name.endsWith('.js')){const rel=path.relative(out,f);if(!fs.readFileSync(f).equals(fs.readFileSync(path.join(root,'dist',rel))))throw Error('Source/dist mismatch: '+rel);files++;}}};walk(out);
 console.log(JSON.stringify({sourceDistParity:true,files}));
}finally{fs.rmSync(out,{recursive:true,force:true});}
