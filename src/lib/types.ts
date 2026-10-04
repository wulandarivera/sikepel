export type Role = "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "PIMPINAN";
export type Status =
  "DRAFT" | "PREVIEW" | "ISSUE_PENDING" | "ISSUED" | "CANCELLED";
export type Row = { id: string; [key: string]: any };
export type User = Row & {
  name: string;
  role: Role;
  village_id: string | null;
  username: string;
};
export type Field = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "checkbox";
  required: boolean;
  options?: string[];
};
export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin Kecamatan",
  ADMIN: "Admin Kelurahan",
  OPERATOR: "Operator",
  PIMPINAN: "Pimpinan",
};
export const statusLabels: Record<Status, string> = {
  DRAFT: "Draft",
  PREVIEW: "Pratinjau",
  ISSUE_PENDING: "Diproses",
  ISSUED: "Terbit",
  CANCELLED: "Dibatalkan",
};
export function dateID(value?: string | Date, long = false) {
  return value
    ? new Date(value).toLocaleDateString("id-ID", {
        day: "numeric",
        month: long ? "long" : "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      })
    : "—";
}
export function dayID(value = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(
    value,
  );
}
