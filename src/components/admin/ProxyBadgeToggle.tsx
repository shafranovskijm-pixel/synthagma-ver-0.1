import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EyeOff, Loader2 } from "lucide-react";

const SETTING_KEY = "hide_proxy_badge";
const LS_KEY = "__hide_proxy_badge";

export function ProxyBadgeToggle() {
  const [hide, setHide] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", SETTING_KEY)
        .maybeSingle();
      const v = data?.setting_value?.value;
      setHide(true);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: existing } = await (supabase as any)
        .from("app_settings")
        .select("setting_key")
        .eq("setting_key", SETTING_KEY)
        .maybeSingle();

      const payload = { value: true };
      const { error } = existing
        ? await (supabase as any)
            .from("app_settings")
            .update({ setting_value: payload })
            .eq("setting_key", SETTING_KEY)
        : await (supabase as any)
            .from("app_settings")
            .insert({ setting_key: SETTING_KEY, setting_value: payload });

      if (error) throw error;

      // Мгновенно применяем на текущей вкладке
      try {
        localStorage.setItem(LS_KEY, "true");
        window.dispatchEvent(new CustomEvent("sintagma:proxy-badge-visibility", { detail: { hide: true } }));
      } catch {}

      setHide(true);
      toast.success("Плашка скрыта");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 p-4 bg-muted/30">
        <p className="font-medium text-sm mb-1">Плашка «Резервный канал»</p>
        <p className="text-xs text-muted-foreground">
          Малая плашка в левом-нижнем углу сайта, оставшаяся от старой сборки на синтагма.рф.
          Она принудительно удаляется стартовым скриптом сайта; резервный backend-канал при этом продолжает работать.
        </p>
      </div>

      <div className="flex items-center justify-between py-3 border-b border-border">
        <div>
          <p className="font-medium text-sm">Скрывать плашку</p>
          <p className="text-xs text-muted-foreground">
            Сейчас: скрыта. Стартовый скрипт удаляет её сразу после появления в DOM.
          </p>
        </div>
        <button
          onClick={() => save()}
          disabled={saving || hide}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
            "bg-primary"
          } ${saving ? "opacity-50" : ""}`}
          aria-label="Скрыть плашку резервного канала"
        >
          <span
            className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6"
          />
        </button>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => save()} disabled={saving || hide}>
          <EyeOff className="w-4 h-4 mr-2" /> Скрыть
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Значение фиксируется как <code>app_settings.hide_proxy_badge = true</code> и
        кешируется в <code> localStorage</code> для мгновенного применения.
      </p>
    </div>
  );
}
