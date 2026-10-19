export function terbilang(value: number): string {
  const n = Math.floor(Math.abs(value)),
    words = [
      "",
      "satu",
      "dua",
      "tiga",
      "empat",
      "lima",
      "enam",
      "tujuh",
      "delapan",
      "sembilan",
      "sepuluh",
      "sebelas",
    ];
  if (!Number.isFinite(n) || n > Number.MAX_SAFE_INTEGER) return "";
  if (n === 0) return "nol";
  const spell = (v: number): string => {
    if (v < 12) return words[v];
    if (v < 20) return spell(v - 10) + " belas";
    if (v < 100) return spell(Math.floor(v / 10)) + " puluh " + spell(v % 10);
    if (v < 200) return "seratus " + spell(v - 100);
    if (v < 1000)
      return spell(Math.floor(v / 100)) + " ratus " + spell(v % 100);
    if (v < 2000) return "seribu " + spell(v - 1000);
    for (const [scale, label] of [
      [1e12, "triliun"],
      [1e9, "miliar"],
      [1e6, "juta"],
      [1e3, "ribu"],
    ] as [number, string][])
      if (v >= scale)
        return (
          spell(Math.floor(v / scale)) + " " + label + " " + spell(v % scale)
        );
    return "";
  };
  return (value < 0 ? "minus " : "") + spell(n).trim().replace(/\s+/g, " ");
}
export function ageOn(birthDate: string, onDate: string) {
  const birth = birthDate.slice(0, 10),
    at = onDate.slice(0, 10);
  return Math.max(
    0,
    Number(at.slice(0, 4)) -
      Number(birth.slice(0, 4)) -
      (at.slice(5) < birth.slice(5) ? 1 : 0),
  );
}
