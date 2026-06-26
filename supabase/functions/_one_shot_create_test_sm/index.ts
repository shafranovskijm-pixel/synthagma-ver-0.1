import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);

  const email = "sales.test@sintagma.com.ru";
  const password = "SalesTest2026!";
  const full_name = "Тестовый менеджер";

  // Check if exists
  const { data: existing } = await admin.auth.admin.listUsers();
  let user = existing?.users?.find((u) => u.email === email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    user = data.user!;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password });
  }

  await admin.from("user_roles").upsert({ user_id: user.id, role: "sales_manager" as any }, { onConflict: "user_id,role" });
  // Remove other roles for this user
  await admin.from("user_roles").delete().eq("user_id", user.id).neq("role", "sales_manager");

  await admin.from("profiles").update({ full_name }).eq("user_id", user.id);

  const { data: sm } = await admin.from("sales_managers").select("id").eq("user_id", user.id).maybeSingle();
  if (!sm) {
    await admin.from("sales_managers").insert({ user_id: user.id, full_name, is_active: true });
  } else {
    await admin.from("sales_managers").update({ full_name, is_active: true }).eq("user_id", user.id);
  }

  return new Response(JSON.stringify({ success: true, user_id: user.id, email, password }), {
    headers: { "Content-Type": "application/json" },
  });
});
