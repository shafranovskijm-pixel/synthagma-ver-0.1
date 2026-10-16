export async function generateTbankToken(params: Record<string, unknown>, password: string): Promise<string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key !== "Token" && value !== null && typeof value !== "object") values[key] = String(value);
  }
  values.Password = password;
  const text = Object.keys(values).sort().map(key => values[key]).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeTokenEqual(received: string, expected: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(received)) return false;
  let difference = 0;
  const token = received.toLowerCase();
  for (let index = 0; index < expected.length; index++) difference |= token.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export type TbankCredentials = { terminalKey: string; password: string; isTestMode: boolean };
export async function resolveTbankCredentials(db: any, organizationId: string, subscription: boolean, boundTerminal?: string | null): Promise<TbankCredentials> {
  const { data, error } = await db.rpc("get_decrypted_payment_settings", { p_organization_id: organizationId });
  if (error) throw new Error("Payment settings unavailable");
  const org = Array.isArray(data) ? data[0] : null;
  if (org?.terminal_key && org?.password && (!boundTerminal || boundTerminal === org.terminal_key)) {
    return { terminalKey: org.terminal_key, password: org.password, isTestMode: org.is_test_mode === true };
  }
  if (subscription) {
    const { data: rows, error: platformError } = await db.from("app_settings").select("setting_key, setting_value")
      .in("setting_key", ["tbank_terminal_key", "tbank_password", "tbank_test_mode"]);
    if (platformError) throw new Error("Platform payment settings unavailable");
    const map = Object.fromEntries((rows || []).map((row: any) => [row.setting_key, row.setting_value]));
    if (map.tbank_terminal_key && map.tbank_password && (!boundTerminal || boundTerminal === map.tbank_terminal_key)) {
      return { terminalKey: map.tbank_terminal_key, password: map.tbank_password, isTestMode: map.tbank_test_mode === "true" };
    }
  }
  throw new Error("Bound payment terminal is not configured");
}
