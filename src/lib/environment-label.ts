export function environmentLabel(data: { demo?: boolean; local?: boolean }) {
  return data.demo === true ? "Lingkungan demo · Data contoh" : "Pelayanan terintegrasi";
}
