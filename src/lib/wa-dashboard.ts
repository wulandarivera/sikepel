export type WaStatus = {
  connected: boolean; hasQr: boolean; qrDataUrl: string | null;
  profile: { phone: string | null; name: string | null; startedAt: string | null };
  logs: { id: string; at: string; direction: "in" | "out"; recipient: string; summary: string; status: string }[];
};
export type AutoReplyMatchType = "EXACT" | "CONTAINS" | "REGEX";
export type WaAutoReply = {
  id: string;
  keyword: string;
  match_type: AutoReplyMatchType;
  reply_text: string;
  is_active: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};
export function waAccess(user: { role: string; village_id: string | null } | null, village: string | undefined) {
  return !!user && !!village && ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(user.role) && user.village_id === village;
}
export function cleanWaText(text: string) {
  return text.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f\u20e3]/gu, "");
}
