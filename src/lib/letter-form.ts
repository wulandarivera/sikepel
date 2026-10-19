export function isNationalityField(field: {
  key: string;
  label?: string;
}): boolean {
  const key = field.key.toLowerCase();
  const label = (field.label || "").toLowerCase();
  return (
    key === "negara" ||
    key.startsWith("negara_") ||
    key === "kewarganegaraan" ||
    key.startsWith("kewarganegaraan_") ||
    label.includes("kewarganegaraan") ||
    label.includes("kebangsaan")
  );
}

export function defaultNationalityValue(field: {
  key: string;
  label?: string;
  type?: string;
  options?: string[];
}): string {
  if (field.type === "select" && Array.isArray(field.options) && field.options.length > 0) {
    if (field.options.includes("Indonesia")) return "Indonesia";
    if (field.options.includes("WNI")) return "WNI";
    return field.options[0];
  }
  return "Indonesia";
}
