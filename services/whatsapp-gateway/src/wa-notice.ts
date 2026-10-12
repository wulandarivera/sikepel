export const WA_STATUSES = ['SUBMITTED','TIKET_BARU','TIKET BARU','PENDING_VERIFICATION','APPROVED','NEEDS_REVISION','REJECTED','COMPLETED','SIAP_DIAMBIL'] as const;
export function canonicalWaStatus(status: string): string {
 if (['SUBMITTED','TIKET_BARU','TIKET BARU'].includes(status)) return 'PENDING_VERIFICATION';
 return status === 'SIAP_DIAMBIL' ? 'COMPLETED' : status;
}
export function safeWaNotice(payload: {ticket:string;status:string}): string {
 const status=canonicalWaStatus(payload.status);
 const messages:Record<string,string>={
 PENDING_VERIFICATION:'Permohonan diterima. Tunggu pemeriksaan petugas.',
 APPROVED:'Permohonan disetujui. Tunggu pemberitahuan surat siap diambil.',
 NEEDS_REVISION:'Permohonan perlu perbaikan. Buka portal untuk melihat catatan dan memperbaiki berkas.',
 REJECTED:'Permohonan ditolak. Buka portal untuk melihat penjelasan; hubungi petugas bila perlu.',
 COMPLETED:'Surat siap diambil di loket pelayanan Kelurahan Cibodas. Periksa petunjuk pengambilan di portal.',
 };
 if (!messages[status]) throw new Error('Status tidak didukung');
 return ['SIKEPEL Kelurahan Cibodas',`Tiket: ${payload.ticket}`,messages[status],`Lacak: https://mandiri.sikepel.biz.id/lacak?tiket=${encodeURIComponent(payload.ticket)}`,'Gunakan tanggal lahir pemohon. Detail pribadi hanya di portal.'].join('\n');
}
