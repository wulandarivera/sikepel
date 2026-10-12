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
 COMPLETED:'Surat siap diambil. '+formatPickupInstructions(),
 };
 if (!messages[status]) throw new Error('Status tidak didukung');
 return ['SIKEPEL Kelurahan Cibodas',`Tiket: ${payload.ticket}`,messages[status],`Lacak: https://mandiri.sikepel.biz.id/lacak?tiket=${encodeURIComponent(payload.ticket)}`,'Gunakan tanggal lahir pemohon. Detail pribadi hanya di portal.'].join('\n');
}

export function formatPickupInstructions(env: Record<string,string|undefined> = process.env): string {
 const fields = [['Lokasi',env.WA_PICKUP_LOCATION],['Jam pengambilan',env.WA_PICKUP_HOURS],['Dokumen pengambilan',env.WA_PICKUP_DOCUMENTS]];
 const lines = fields.flatMap(([label,value]) => value?.trim() ? [`${label}: ${value.trim()}`] : []);
 return ['Surat fisik diambil di loket setelah dinyatakan siap; tidak ada PDF surat lewat WhatsApp.',...lines,
 lines.length < fields.length ? 'Informasi pengambilan belum dikonfigurasi lengkap. Hubungi petugas untuk petunjuk resmi.' : 'Ikuti petunjuk resmi petugas sebelum datang.'].join('\n');
}
