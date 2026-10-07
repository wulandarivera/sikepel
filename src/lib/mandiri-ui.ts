export type PortalField = {key:string;label:string;type:'text'|'textarea'|'number'|'date'|'select'|'checkbox';options?:string[]};
export type PortalType = {id:string;name:string;description?:string;fields:PortalField[];defaults:Record<string,string>;requirements:{id:string;label:string;mandatory:boolean}[]};
export function attachmentError(files:readonly {size:number;type:string}[]) {
  if(files.length>3) return 'Maksimal tiga lampiran.';
  for(const file of files) {
    if(!file.size) return 'Berkas kosong tidak dapat diunggah.';
    if(file.size>2*1024*1024) return 'Setiap lampiran maksimal 2 MB.';
    if(!['application/pdf','image/png','image/jpeg'].includes(file.type)) return 'Gunakan PDF, PNG, atau JPEG.';
  }
  return '';
}
export function statusView(status:string) {
  switch(status) {
    case 'PENDING_VERIFICATION': return {label:'Menunggu verifikasi berkas',step:1};
    case 'NEEDS_REVISION': return {label:'Perlu perbaikan',step:1};
    case 'APPROVED': return {label:'Disetujui',step:2};
    case 'COMPLETED': return {label:'Selesai',step:3};
    case 'REJECTED': return {label:'Ditolak',step:-1};
    default: return {label:'Status belum dikenali',step:-1};
  }
}
export async function portalFetch<T>(url:string,options?:RequestInit):Promise<T> {
  const response=await fetch(url,{...options,cache:'no-store'});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || 'Permintaan tidak dapat diproses. Coba lagi.');
  return data as T;
}
