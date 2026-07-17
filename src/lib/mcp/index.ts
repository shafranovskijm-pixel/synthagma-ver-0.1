import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import getMyProfileTool from "./tools/get-my-profile";

// Direct Supabase host is required for OAuth issuer discovery (RFC 8414 §3.3).
// Never use SUPABASE_URL — on Lovable Cloud it may be the .lovable.cloud proxy.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "sintagma-mcp",
  title: "СИНТАГМА",
  version: "0.1.0",
  instructions:
    "Инструменты платформы СИНТАГМА. Используйте `whoami` для проверки подключения и `get_my_profile` для чтения профиля текущего пользователя.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, getMyProfileTool],
});
