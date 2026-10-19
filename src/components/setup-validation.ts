export function getSetupStepError(data: FormData, step: number): string {
 const roles = step === 1 ? [['superAdmin','Super Admin']] : step === 3 ? [['admin','Admin Kelurahan'],['operator','Operator Kelurahan']] : [];
 for (const [key,label] of roles) {
  if (data.get(`${key}.password`) !== data.get(`${key}.confirm`)) return `Konfirmasi kata sandi ${label} belum sesuai.`;
 }
 return '';
}
