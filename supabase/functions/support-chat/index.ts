import { AccessError, checked, readObject, accessErrorResponse } from '../_shared/privileged-access.ts';
import { requireSupportPrincipal, requireSupportConversation } from './authorization.ts';
import { DSR_SUPPORT_CONTEXT } from "../_shared/data-subject-deadline-rules.ts";
import { STUDENT_QUOTA_SUPPORT_CONTEXT } from "../_shared/student-quota-rules.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/gigachat-client.ts";
import { SUPPORT_CONTACT_CONTEXT, officialSupportContactReply, guardSupportContactAnswer, supportMessagesFromLatest } from "../_shared/platform-support-contacts.ts";
import { logExternalOperation } from "../_shared/external-operation-observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Ты — официальная техническая поддержка образовательной платформы Sintagma (Синтагма, sintagma.com.ru).
Отвечай вежливо, конкретно, на «вы», без воды. Структурируй ответы списками, если нужно.

ЧТО ТЫ ЗНАЕШЬ О ПЛАТФОРМЕ:
• Это LMS для дополнительного профессионального образования (ДПО, ПО, рабочие профессии).
• Тарифы: Бесплатный, Старт, Стандарт, Профессиональный, Максимальный. Стоимость и числовые лимиты сверяй с текущей страницей тарифов; не обещай бессрочную платную подписку.
${STUDENT_QUOTA_SUPPORT_CONTEXT}
${DSR_SUPPORT_CONTEXT}
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
  action?: 'send' | 'history';
  conversationId?: string;
  guestToken?: string;
  message?: string;
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

/**
 * Вызов ИИ через общий клиент: пробует все 3 GigaChat-слота по очереди,
 * при исчерпании токенов (402) или 429 переключается на следующий ключ,
 * финально откатывается на Lovable AI (Gemini).
 */
async function callSupportAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  const fullMessages = [{ role: "system", content: SYSTEM_PROMPT + "\n\n" + SUPPORT_CONTACT_CONTEXT }, ...messages];
  const { text, model } = await callAI(
    fullMessages,
    1024,
    "gigachat",            // preferredProvider — сначала все 3 GigaChat-слота, затем Lovable AI
    "GigaChat-Pro",
    "google/gemini-2.5-flash",
  );
  console.log(`[support-chat] AI answered via ${model}`);
  return text || "Извините, не удалось сформировать ответ.";
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
      ((..._uc027LogArgs: unknown[]) => logExternalOperation("log", "support_topic_created"))(`[Telegram] created topic ${activeTopicId} "${topicName}"`);
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
      ((..._uc027LogArgs: unknown[]) => logExternalOperation("error", "support_topic_failed"))("[Telegram] createForumTopic failed:", createData.description, "— проверьте: 1) бот админ группы, 2) Topics включены, 3) TELEGRAM_SUPPORT_CHAT_ID правильный (-100…)");
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
    ((..._uc027LogArgs: unknown[]) => logExternalOperation("error", "support_delivery_failed"))("[Telegram] sendMessage error:", sendData);
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

    const body = await readObject(req) as RequestBody;
    const action = body.action ?? 'send';
    if (action !== 'send' && action !== 'history') throw new AccessError(400, 'Некорректный запрос.');
    const principal = await requireSupportPrincipal(req, supabase, Deno.env.get('SUPABASE_ANON_KEY') ?? '', body.guestToken);
    let conversationId = body.conversationId;
    let conv: { id: string; status: string; telegram_topic_id: number | null; ai_failures_count: number } | null = null;
    if (conversationId != null || action === 'history') {
      const owned = await requireSupportConversation(supabase, principal, conversationId);
      conversationId = owned.id;
      conv = owned;
      if (action === 'history') {
        const messages = checked(await supabase.from('support_messages').select('id, role, content, sender_name, created_at').eq('conversation_id', owned.id).order('created_at'));
        return new Response(JSON.stringify({ conversationId: owned.id, status: owned.status, unread_for_user: owned.unread_for_user, messages: messages ?? [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
    }
    if (typeof body.message !== 'string' || body.message.trim().length === 0) throw new AccessError(400, 'Empty message');

    const userId = principal.userId;
    let userLabel = 'Гость';
    let userOrgId: string | null = null;
    if (userId) {
      const profile = checked<any>(await supabase.from('profiles').select('full_name, email, organization_id').eq('user_id', userId).maybeSingle());
      userLabel = profile?.full_name || profile?.email || 'Пользователь';
      userOrgId = profile?.organization_id ?? null;
    } else {
      userLabel = body.guestName || body.guestEmail || 'Гость';
    }

    if (!conv) {
      const { data: newConv, error: convErr } = await supabase.from("support_conversations").insert({
        user_id: userId,
        guest_token: principal.guestToken,
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
    const currentMessageId = crypto.randomUUID();
    await supabase.from("support_messages").insert({
      id: currentMessageId,
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
      .select("id, role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "ai"])
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(20);

    const aiMessages = supportMessagesFromLatest(history ?? [], currentMessageId, body.message);

    // Вызываем ИИ: общий клиент сам обходит все 3 GigaChat-слота и финально Lovable AI
    let aiResponse = "";
    let aiError: Error | null = null;
    try {
      aiResponse = officialSupportContactReply(body.message) ?? guardSupportContactAnswer(await callSupportAI(aiMessages));
    } catch (e) {
      console.warn("[support-chat] All AI providers exhausted:", e);
      aiError = e as Error;
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
    if (error instanceof AccessError) return accessErrorResponse(error, corsHeaders);
    const msg = error instanceof Error ? error.message : "Unknown";
    console.error("support-chat error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
