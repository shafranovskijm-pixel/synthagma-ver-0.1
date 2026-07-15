import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EyeOff, Eye, Loader2 } from "lucide-react";

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
      setHide(v !== false);
      setLoading(false);
    })();
  }, []);

  const save = async (next: boolean) => {
    setSaving(true);
    try {
      const { data: existing } = await (supabase as any)
        .from("app_settings")
        .select("setting_key")
        .eq("setting_key", SETTING_KEY)
        .maybeSingle();

      const payload = { value: next };
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
        localStorage.setItem(LS_KEY, next ? "true" : "false");
        window.dispatchEvent(new CustomEvent("sintagma:proxy-badge-visibility", { detail: { hide: next } }));
      } catch {}

      setHide(next);
      toast.success(next ? "Плашка скрыта" : "Плашка снова показывается");
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
          Тумблер сохраняется в базе и подхватывается стартовым скриптом сайта без пересборки —
          на всех устройствах при следующей загрузке страницы.
        </p>
      </div>

      <div className="flex items-center justify-between py-3 border-b border-border">
        <div>
          <p className="font-medium text-sm">Скрывать плашку</p>
          <p className="text-xs text-muted-foreground">
            {hide
              ? "Сейчас: скрыта. Стартовый скрипт удаляет её каждую секунду."
              : "Сейчас: показывается (если попадёт в DOM из старого бандла)."}
          </p>
        </div>
        <button
          onClick={() => save(!hide)}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
            hide ? "bg-primary" : "bg-muted"
          } ${saving ? "opacity-50" : ""}`}
          aria-label="Скрыть плашку резервного канала"
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              hide ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving || hide}>
          <EyeOff className="w-4 h-4 mr-2" /> Скрыть
        </Button>
        <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving || !hide}>
          <Eye className="w-4 h-4 mr-2" /> Показать
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Значение хранится в <code>app_settings.hide_proxy_badge</code>. Стартовый скрипт
        <code> index.html</code> читает его через анонимный REST-запрос при каждой загрузке и
        кеширует в <code>localStorage</code> для мгновенного применения.
      </p>
    </div>
  );
}
