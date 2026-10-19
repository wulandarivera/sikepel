import { timingSafeEqual } from 'node:crypto';
type Status = {ticket_code:string;status:string};
export async function ticketStatusResponse(req:Request, config:{secret:string;villageId:string}, lookup:(ticket:string,sender:string,village:string)=>Promise<Status|null>) {
 const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 const supplied=Buffer.from(req.headers.get('authorization')||'');
 const expected=Buffer.from(`Bearer ${config.secret}`);
 if(!config.secret || !config.villageId || supplied.length!==expected.length || !timingSafeEqual(supplied,expected) || req.headers.get('X-WA-Village-ID')!==config.villageId) return json({error:'Akses ditolak.'},403);
 const url=new URL(req.url);
 try {
 const row=await lookup(url.searchParams.get('ticket')||'',url.searchParams.get('sender')||'',config.villageId);
 return row ? json({ticket_code:row.ticket_code,status:row.status}) : json({error:'Status tidak tersedia. Gunakan portal pelacakan.'},404);
 } catch {return json({error:'Status tidak tersedia. Gunakan portal pelacakan.'},503);}
}
