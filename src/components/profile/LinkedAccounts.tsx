import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { YandexLoginButton } from "@/components/auth/YandexLoginButton";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface YandexIdentity {
  id: string;
  yandex_email: string | null;
  yandex_login: string | null;
  yandex_display_name: string | null;
  linked_at: string;
}

export const LinkedAccounts = () => {
  const { user } = useAuth();
  const [identity, setIdentity] = useState<YandexIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("yandex_identities")
      .select("id, yandex_email, yandex_login, yandex_display_name, linked_at")
      .eq("user_id", user.id)
      .maybeSingle();
    setIdentity(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const handleUnlink = async () => {
    if (!identity) return;
    if (!confirm("Отвязать аккаунт Яндекс? После этого вход через Яндекс перестанет работать.")) return;
    setUnlinking(true);
    const { error } = await supabase.from("yandex_identities").delete().eq("id", identity.id);
    if (error) {
      toast.error("Не удалось отвязать");
    } else {
      toast.success("Аккаунт Яндекс отвязан");
      setIdentity(null);
    }
    setUnlinking(false);
  };

  if (loading) {
    return (
      <div className="p-6 rounded-2xl border bg-card flex justify-center">
        <SigmaSpinner size="sm" />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl border bg-card space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold">Привязанные аккаунты</h3>
        <p className="text-sm text-muted-foreground">
          Привяжите Яндекс ID, чтобы входить одной кнопкой
        </p>
      </div>

      {identity ? (
        <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FC3F1D] flex items-center justify-center text-white font-bold">
              Я
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Яндекс ID</span>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                {identity.yandex_email ?? identity.yandex_login ?? identity.yandex_display_name}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleUnlink} disabled={unlinking}>
            {unlinking ? <SigmaSpinner size="sm" /> : <><Unlink className="w-4 h-4 mr-1" /> Отвязать</>}
          </Button>
        </div>
      ) : (
        <YandexLoginButton mode="link" label="Привязать Яндекс ID" />
      )}
    </div>
  );
};
