import { supabase } from "@/integrations/supabase/client";
import { createSelfProfileInitializer, createSelfProfileWriter, SelfProfileError, type SelfProfilePort } from "@/lib/selfProfile";

const projection = "id,user_id,full_name,phone,city,bio,vk_link,telegram_link";
const ownProfilePort: SelfProfilePort = {
  async authorize(expectedUserId) {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (session.error || !token || session.data.session?.user.id !== expectedUserId) throw new SelfProfileError("SELF_PROFILE_AUTH_REQUIRED");
    const verified = await supabase.auth.getUser(token);
    if (verified.error || verified.data.user?.id !== expectedUserId) throw new SelfProfileError("SELF_PROFILE_AUTH_REQUIRED");
    return { userId: expectedUserId, authorization: "Bearer " + token };
  },
  async isCurrent(authority) {
    const session = await supabase.auth.getSession();
    return !session.error && session.data.session?.user.id === authority.userId
      && "Bearer " + session.data.session?.access_token === authority.authorization;
  },
  async ensure(authority) {
    return await supabase.rpc("ensure_my_profile", {}).setHeader("Authorization", authority.authorization);
  },
  async update(authority, changes) {
    return await supabase.from("profiles").update(changes).eq("user_id", authority.userId)
      .is("blocked_at", null).is("archived_at", null)
      .select(projection).maybeSingle().setHeader("Authorization", authority.authorization);
  },
  async read(authority) {
    return await supabase.from("profiles").select(projection).eq("user_id", authority.userId)
      .is("blocked_at", null).is("archived_at", null).maybeSingle().setHeader("Authorization", authority.authorization);
  },
};
export const ensureOwnProfile = createSelfProfileInitializer(ownProfilePort);
export const saveOwnProfile = createSelfProfileWriter(ownProfilePort);
