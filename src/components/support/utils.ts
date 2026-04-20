/** Локальное хранилище для гостевого токена и id текущего диалога */
export const GUEST_TOKEN_KEY = "sintagma_support_guest_token";
export const CONVERSATION_ID_KEY = "sintagma_support_conv_id";

export function getGuestToken(): string {
  let token = localStorage.getItem(GUEST_TOKEN_KEY);
  if (!token) {
    token = `guest_${crypto.randomUUID()}`;
    localStorage.setItem(GUEST_TOKEN_KEY, token);
  }
  return token;
}

export type SupportSource =
  | "landing"
  | "student"
  | "organization"
  | "company"
  | "partner"
  | "admin";

export function detectSource(pathname: string): SupportSource {
  if (pathname.startsWith("/student")) return "student";
  if (pathname.startsWith("/organization")) return "organization";
  if (pathname.startsWith("/company")) return "company";
  if (pathname.startsWith("/partner")) return "partner";
  if (pathname.startsWith("/admin")) return "admin";
  return "landing";
}

export interface SupportMessage {
  id: string;
  role: "user" | "ai" | "operator" | "system";
  content: string;
  sender_name?: string | null;
  created_at: string;
}

export type SupportStatus = "ai" | "human" | "closed";
export type SupportView = "home" | "chat";
