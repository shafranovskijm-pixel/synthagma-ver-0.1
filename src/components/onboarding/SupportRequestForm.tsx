import { useState, useRef } from "react";
import { Send, ImagePlus, X, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

import { useAuth } from "@/hooks/useAuth";
import { useErrorLogger } from "@/hooks/useErrorLogger";
import { toast } from "sonner";

export function SupportRequestForm() {
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user, userRole } = useAuth();
  const { getRecentErrors } = useErrorLogger();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Файл слишком большой", { description: "Максимум 5 МБ" });
      return;
    }
    setScreenshot(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSend = async () => {
    if (!description.trim()) {
      toast.error("Опишите проблему");
      return;
    }

    setSending(true);
    try {
      // Get profile info
      let userName = "";
      let userEmail = user?.email || "";
      let orgId = "";
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, organization_id")
          .eq("user_id", user.id)
          .single();
        if (profile) {
          userName = profile.full_name || "";
          orgId = profile.organization_id || "";
        }
      }

      // Determine chat_id: org-specific or global fallback
      let chatId: string | null = null;
      if (orgId) {
        const { data: org } = await supabase
          .from("organizations")
          .select("telegram_chat_id")
          .eq("id", orgId)
          .single();
        chatId = org?.telegram_chat_id || null;
      }

      // Upload screenshot if present
      let photoUrl: string | null = null;
      if (screenshot && user) {
        const ext = screenshot.name.split(".").pop() || "png";
        const path = `support/${user.id}/${Date.now()}.${ext}`;
        const bucket = userRole === "student" ? "student-documents" : "org-documents";
        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(path, screenshot, { contentType: screenshot.type });
        if (!uploadErr) {
          // Get signed URL for private bucket
          const { data: signedData } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, 86400);
          photoUrl = signedData?.signedUrl || null;
        }
      }

      // Collect errors
      const errors = getRecentErrors(5);
      const errorsText = errors.length
        ? errors.map((e, i) => `${i + 1}. ${e.message}`).join("\n")
        : "Нет";

      // Save to DB
      if (user) {
        await supabase.from("support_requests").insert({
          user_id: user.id,
          user_name: userName || null,
          user_email: userEmail || null,
          user_role: userRole || null,
          organization_id: orgId || null,
          description: description.trim(),
          contact_phone: contactPhone.trim() || null,
          screenshot_url: photoUrl,
          browser_info: navigator.userAgent.slice(0, 200),
          page_url: window.location.href,
          error_logs: errorsText !== "Нет" ? errorsText : null,
        });
      }

      // Build message
      const roleName = userRole === "organization" ? "Организация" : userRole === "admin" ? "Админ" : "Ученик";
      const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
      const ua = navigator.userAgent.slice(0, 120);

      const message = `🆘 <b>Обращение в поддержку</b>

<b>Пользователь:</b> ${userName || "—"} (${userEmail})
<b>Роль:</b> ${roleName}${contactPhone.trim() ? `\n<b>Телефон для связи:</b> ${contactPhone.trim()}` : ""}
${orgId ? `<b>Организация ID:</b> <code>${orgId}</code>` : ""}
<b>Время:</b> ${now}

<b>Описание проблемы:</b>
${description.slice(0, 1000)}

<b>Браузер:</b> ${ua}
<b>URL:</b> ${window.location.href}

<b>Последние ошибки:</b>
${errorsText}${photoUrl ? `\n\n<b>Скриншот:</b> ${photoUrl}` : ""}`;

      const body: Record<string, string> = { message };
      if (chatId) body.chat_id = chatId;
      if (photoUrl) body.photo_url = photoUrl;

      // Non-blocking: don't fail the whole request if Telegram is down
      try {
        await supabase.functions.invoke("send-telegram-notification", { body });
      } catch (telegramErr) {
        console.warn("Telegram notification failed (non-blocking):", telegramErr);
      }

      toast.success("Обращение отправлено!", { description: "Мы свяжемся с вами в ближайшее время" });
      setDescription("");
      setContactPhone("");
      removeScreenshot();
    } catch (err) {
      console.error("Support request error:", err);
      toast.error("Ошибка отправки", { description: "Попробуйте позже" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <Textarea
        placeholder="Опишите проблему или ошибку..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="min-h-[80px] text-sm"
        maxLength={1000}
      />


      <div className="flex items-center gap-2">
        <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <Input
          placeholder="Телефон для связи (необязательно)"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          className="h-8 text-sm"
          maxLength={20}
        />
      </div>

      {previewUrl && (
        <div className="relative inline-block">
          <img src={previewUrl} alt="Скриншот" className="max-h-32 rounded-lg border border-border/50" />
          <button
            onClick={removeScreenshot}
            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={sending}
        >
          <ImagePlus className="w-4 h-4 mr-1" />
          Скриншот
        </Button>
        <Button size="sm" onClick={handleSend} disabled={sending || !description.trim()}>
          {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          Отправить
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Автоматически прикладывается: URL, браузер, логи ошибок
      </p>
      <a
        href="https://t.me/+SVTbxqnGmF1iMzIy"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        💬 Чат тех. поддержки в Telegram
      </a>
    </div>
  );
}
