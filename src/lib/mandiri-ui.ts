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

export const REUPLOAD_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const REUPLOAD_ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;

export interface ReuploadValidationResult {
  valid: boolean;
  error?: string;
}

export function isRevisionRequired(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toUpperCase();
  return s === 'NEEDS_REVISION' || s === 'REVISION_REQUIRED' || s === 'PERLU_REVISI';
}

export function validateReuploadFile(file: { name?: string; size: number; type?: string } | null | undefined): ReuploadValidationResult {
  if (!file) {
    return { valid: false, error: 'Berkas tidak ditemukan.' };
  }
  if (!file.size || file.size <= 0) {
    return { valid: false, error: 'Berkas kosong tidak dapat diunggah.' };
  }
  if (file.size > REUPLOAD_MAX_FILE_SIZE) {
    return { valid: false, error: 'Ukuran berkas melebihi batas maksimal 5 MB.' };
  }
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const validMime = REUPLOAD_ALLOWED_TYPES.includes(type as any);
  const validExt = name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png');

  if (!validMime && !validExt) {
    return { valid: false, error: 'Format berkas tidak didukung. Gunakan format PDF, JPG, atau PNG.' };
  }
  return { valid: true };
}

export function validateReuploadBundle(files: {
  ktp?: { name?: string; size: number; type?: string } | null;
  kk?: { name?: string; size: number; type?: string } | null;
  surat_pendukung?: { name?: string; size: number; type?: string } | null;
}): ReuploadValidationResult {
  const chosen = [files.ktp, files.kk, files.surat_pendukung].filter((f): f is NonNullable<typeof f> => Boolean(f));
  if (chosen.length === 0) {
    return { valid: false, error: 'Pilih minimal satu berkas perbaikan untuk diunggah.' };
  }
  for (const f of chosen) {
    const res = validateReuploadFile(f);
    if (!res.valid) return res;
  }
  return { valid: true };
}

export function statusView(status:string) {
  switch(status) {
    case 'PENDING_VERIFICATION': return {label:'Menunggu verifikasi berkas',step:1};
    case 'NEEDS_REVISION':
    case 'REVISION_REQUIRED':
    case 'PERLU_REVISI': return {label:'Perlu perbaikan',step:1};
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

export type AdminAudit = {id:string;actor:string;action:string;metadata:{reason?:string;revision_note?:string;changed_fields?:string[]};created_at:string};
export function adminHistory(detail:{riwayat?:AdminAudit[];status_riwayat?:AdminAudit[];audit_trail?:AdminAudit[]}):AdminAudit[] {
 return detail.riwayat ?? detail.status_riwayat ?? detail.audit_trail ?? [];
}

export function adminCanEdit(status:string):boolean {
 return ['PENDING_VERIFICATION','NEEDS_REVISION','APPROVED'].includes(status);
}

// No receipt or pickup projection exists in the current admin response.
export function adminCommunication(_detail:{status:string}) {
 return {delivery:'Bukti pengiriman WhatsApp belum tersedia',pickup:'Belum dikonfigurasi pada portal admin. Hubungi petugas untuk petunjuk resmi.'};
}
