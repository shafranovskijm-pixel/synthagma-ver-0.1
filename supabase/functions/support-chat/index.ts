import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Ты — официальная техническая поддержка образовательной платформы Sintagma (Синтагма, sintagma.com.ru).
Отвечай вежливо, конкретно, на «вы», без воды. Структурируй ответы списками, если нужно.

ЧТО ТЫ ЗНАЕШЬ О ПЛАТФОРМЕ:
• Это LMS для дополнительного профессионального образования (ДПО, ПО, рабочие профессии).
• Тарифы: Бесплатный (до 10 учеников), Старт, Стандарт, Профессиональный, Максимальный. Все тарифы навсегда — без скрытых платежей.
• Конструктор курсов: уроки разных типов (видео, презентация, тест, обратная связь, ИИ-аватар, домашнее задание).
• ИИ-генерация курсов и обложек (на базе GigaChat).
• ФИС ФРДО: автоматическая выгрузка отчётов в Excel (35/41 колонка).
• Документы об образовании: автоматическое формирование удостоверений, дипломов, протоколов после 100% прохождения курса.
• Вебинары через Kinescope (Профессиональный/Максимальный).
• ИИ-аватар как преподаватель (LiveKit + STT/LLM/TTS).
• Маркетплейс: 200+ готовых программ, можно купить и адаптировать.
• Электронная подпись документов (ПЭП — простая электронная подпись по 63-ФЗ).
• Платежи через Т-Банк (Тинькофф) с поддержкой 54-ФЗ.
• Реферальная программа: 3 уровня (20%/10%/5%).

ОГРАНИЧЕНИЯ:
• Если не знаешь ответ или вопрос требует доступа к личным данным конкретного пользователя/организации — честно скажи и предложи связаться с оператором.
• Не выдумывай факты о ценах, лимитах, законах. Если не уверен — направляй к оператору.
• Не давай юридических консультаций, кроме общих ссылок на оферту и пользовательское соглашение.

ЭСКАЛАЦИЯ К ОПЕРАТОРУ:
Если пользователь просит «оператора», «человека», «жалобу», или вопрос требует ручного вмешательства (вернуть оплату, разблокировать аккаунт, исправить данные), ответь короткой подсказкой: «Передаю ваш вопрос оператору поддержки. Он ответит здесь же в чате».`;

interface RequestBody {
  conversationId?: string;
  guestToken?: string;
  message: string;
  source?: 'landing' | 'student' | 'organization' | 'company' | 'partner' | 'admin';
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
}

const ESCALATION_KEYWORDS = ['оператор', 'человек', 'живой', 'жалоб', 'претенз', 'возврат', 'верните', 'разблокир', 'не работает', 'обман'];

function shouldEscalate(text: string): boolean {
  const lower = text.toLowerCase();
  return ESCALATION_KEYWORDS.some(kw => lower.includes(kw));
}

async function callLovableAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Lovable AI ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "Извините, не удалось сформировать ответ.";
}

async function callGigaChat(messages: Array<{ role: string; content: string }>): Promise<string> {
  const authKey = Deno.env.get("GIGACHAT_AUTH_KEY") || Deno.env.get("GIGACHAT_AUTH_KEY_2") || Deno.env.get("GIGACHAT_AUTH_KEY_3");
  if (!authKey) throw new Error("GIGACHAT_AUTH_KEY missing");

  // Получаем access token
  const tokenResp = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "RqUID": crypto.randomUUID(),
      Accept: "application/json",
    },
    body: "scope=GIGACHAT_API_PERS",
  });
  if (!tokenResp.ok) throw new Error(`GigaChat token ${tokenResp.status}`);
  const { access_token } = await tokenResp.json();

  const resp = await fetch("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "GigaChat",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.4,
    }),
  });
  if (!resp.ok) throw new Error(`GigaChat ${resp.status}`);
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  // GigaChat иногда возвращает модерационные отказы — пропускаем такие к Lovable AI
  if (/я не могу|не уполномочен|не в моих правилах/i.test(content)) {
    throw new Error("GigaChat moderation refusal");
  }
  return content;
}

async function sendToTelegramTopic(
  topicId: number | null,
  text: string,
  conversationId: string,
  isUser: boolean,
  userLabel: string,
  source?: string,
  contact?: string
): Promise<{ topic_id?: number; message_id?: number } | null> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID");
  if (!botToken || !chatId) {
    console.log("[Telegram] skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_SUPPORT_CHAT_ID missing");
    return null;
  }

  let activeTopicId = topicId;

  // Если темы нет — создаём
  if (!activeTopicId) {
    const sourceLabel = source === 'organization' ? 'Организация'
      : source === 'student' ? 'Ученик'
      : source === 'company' ? 'Компания'
      : source === 'partner' ? 'Партнёр'
      : 'Гость с сайта';
    const titleParts = [`💬 ${userLabel}`, sourceLabel];
    if (contact) titleParts.push(contact);
    const topicName = titleParts.join(' · ').slice(0, 128);

    const createResp = await fetch(`https://api.telegram.org/bot${botToken}/createForumTopic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, name: topicName }),
    });
    const createData = await createResp.json();
    if (createData.ok) {
      activeTopicId = createData.result.message_thread_id;
      console.log(`[Telegram] created topic ${activeTopicId} "${topicName}"`);
      // Стартовое системное сообщение со ссылкой на админку
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: activeTopicId,
          text: `🆕 Новый диалог поддержки\n${sourceLabel}: ${userLabel}${contact ? `\nКонтакт: ${contact}` : ''}\nID: ${conversationId}\n\nОтвечайте здесь — сообщения попадут пользователю в чат на сайте.`,
        }),
      });
    } else {
      console.error("[Telegram] createForumTopic failed:", createData.description, "— проверьте: 1) бот админ группы, 2) Topics включены, 3) TELEGRAM_SUPPORT_CHAT_ID правильный (-100…)");
      // Fallback — шлём в общий чат с разделителем
    }
  }

  const prefix = isUser ? "👤" : "🤖";
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: `${prefix} ${text}`,
  };
  if (activeTopicId) body.message_thread_id = activeTopicId;

  const sendResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const sendData = await sendResp.json();
  if (!sendData.ok) {
    console.error("[Telegram] sendMessage error:", sendData);
    return null;
  }
  return { topic_id: activeTopicId ?? undefined, message_id: sendData.result.message_id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = (await req.json()) as RequestBody;
    if (!body.message || body.message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Empty message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth user (optional)
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let userLabel = "Гость";
    let userOrgId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email, organization_id")
          .eq("user_id", user.id).maybeSingle();
        userLabel = profile?.full_name || profile?.email || user.email || "Пользователь";
        userOrgId = profile?.organization_id ?? null;
      }
    }

    if (!userId) {
      userLabel = body.guestName || body.guestEmail || `Гость ${body.guestToken?.slice(0, 6) ?? ''}`;
    }

    // Найти или создать диалог
    let conversationId = body.conversationId;
    let conv: { id: string; status: string; telegram_topic_id: number | null; ai_failures_count: number } | null = null;

    if (conversationId) {
      const { data } = await supabase.from("support_conversations")
        .select("id, status, telegram_topic_id, ai_failures_count")
        .eq("id", conversationId).maybeSingle();
      conv = data;
    }

    if (!conv) {
      const { data: newConv, error: convErr } = await supabase.from("support_conversations").insert({
        user_id: userId,
        guest_token: userId ? null : body.guestToken,
        guest_name: body.guestName,
        guest_email: body.guestEmail,
        guest_phone: body.guestPhone,
        organization_id: userOrgId,
        source: body.source ?? 'landing',
        title: body.message.slice(0, 80),
      }).select("id, status, telegram_topic_id, ai_failures_count").single();
      if (convErr) throw convErr;
      conv = newConv;
      conversationId = newConv.id;
    }

    // Записываем сообщение пользователя
    await supabase.from("support_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: body.message,
      sender_user_id: userId,
      sender_name: userLabel,
    });

    // Дублируем в Telegram
    const tgContact = body.guestEmail || body.guestPhone || undefined;
    const tgUser = await sendToTelegramTopic(
      conv.telegram_topic_id,
      body.message,
      conversationId!,
      true,
      userLabel,
      body.source,
      tgContact
    );
    if (tgUser?.topic_id && !conv.telegram_topic_id) {
      await supabase.from("support_conversations")
        .update({ telegram_topic_id: tgUser.topic_id })
        .eq("id", conversationId);
      conv.telegram_topic_id = tgUser.topic_id;
    }

    // Если диалог переведён на оператора — ИИ молчит
    if (conv.status === 'human') {
      return new Response(JSON.stringify({
        conversationId,
        aiResponse: null,
        status: 'human',
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Эскалация по ключевым словам
    if (shouldEscalate(body.message)) {
      const escalateMsg = "Передаю ваш вопрос оператору поддержки. Он ответит здесь же в чате — обычно в течение рабочего дня.";
      await supabase.from("support_conversations")
        .update({ status: 'human' }).eq("id", conversationId);
      await supabase.from("support_messages").insert({
        conversation_id: conversationId,
        role: "system",
        content: escalateMsg,
        sender_name: "Система",
      });
      await sendToTelegramTopic(conv.telegram_topic_id, "⚠️ Запрошена эскалация — нужен оператор", conversationId!, false, userLabel);
      return new Response(JSON.stringify({
        conversationId,
        aiResponse: escalateMsg,
        status: 'human',
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Получаем историю сообщений
    const { data: history } = await supabase.from("support_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "ai"])
      .order("created_at").limit(20);

    const aiMessages = (history ?? []).map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content,
    }));

    // Вызываем ИИ: GigaChat → Lovable AI fallback
    let aiResponse = "";
    let aiError: Error | null = null;
    try {
      aiResponse = await callGigaChat(aiMessages);
    } catch (e) {
      console.warn("GigaChat failed, fallback to Lovable AI:", e);
      try {
        aiResponse = await callLovableAI(aiMessages);
      } catch (e2) {
        aiError = e2 as Error;
      }
    }

    if (aiError || !aiResponse) {
      // Авто-эскалация: 2 неудачи подряд
      const newFailures = (conv.ai_failures_count ?? 0) + 1;
      const escalate = newFailures >= 2;
      await supabase.from("support_conversations").update({
        ai_failures_count: newFailures,
        status: escalate ? 'human' : conv.status,
      }).eq("id", conversationId);

      const fallbackMsg = escalate
        ? "Извините, не могу ответить автоматически. Передаю вопрос оператору — он скоро напишет."
        : "Извините, временная неполадка. Попробуйте переформулировать вопрос или попросите оператора.";

      await supabase.from("support_messages").insert({
        conversation_id: conversationId,
        role: "system",
        content: fallbackMsg,
      });

      return new Response(JSON.stringify({
        conversationId, aiResponse: fallbackMsg, status: escalate ? 'human' : 'ai',
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Сохраняем ответ ИИ
    await supabase.from("support_messages").insert({
      conversation_id: conversationId,
      role: "ai",
      content: aiResponse,
    });
    await supabase.from("support_conversations").update({ ai_failures_count: 0 }).eq("id", conversationId);

    // Дублируем ответ в Telegram
    await sendToTelegramTopic(conv.telegram_topic_id, aiResponse, conversationId!, false, userLabel);

    // Авто-эскалация если ИИ предложил оператора
    let finalStatus = 'ai';
    if (/передаю.*оператор|свяжитесь с оператор|оператор.*ответит/i.test(aiResponse)) {
      await supabase.from("support_conversations").update({ status: 'human' }).eq("id", conversationId);
      finalStatus = 'human';
    }

    return new Response(JSON.stringify({
      conversationId, aiResponse, status: finalStatus,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.error("support-chat error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
