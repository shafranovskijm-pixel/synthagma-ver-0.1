import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Phone, Save, Check } from "lucide-react";
import { toast } from "sonner";
import { normalizeRuPhone } from "@/utils/phoneParser";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface StudentPhoneEditorProps {
  userId: string;
}

export function StudentPhoneEditor({ userId }: StudentPhoneEditorProps) {
  const [phone, setPhone] = useState("");
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles").select("phone").eq("user_id", userId).maybeSingle();
      if (!cancelled) {
        const p = data?.phone || "";
        setPhone(p);
        setInitial(p);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalized = phone.trim() ? (normalizeRuPhone(phone) || phone.trim()) : null;
      const { error } = await supabase
        .from("profiles").update({ phone: normalized }).eq("user_id", userId);
      if (error) throw error;
      setInitial(normalized || "");
      setPhone(normalized || "");
      toast.success("Телефон сохранён");
    } catch (e) {
      console.error(e);
      toast.error("Не удалось сохранить телефон");
    } finally {
      setSaving(false);
    }
  };

  const changed = phone.trim() !== initial.trim();

  return (
    <div className="mt-3 p-3 bg-background rounded-lg border border-border">
      <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
        <Phone className="w-3.5 h-3.5" /> Телефон
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+7 999 123-45-67"
          inputMode="tel"
          disabled={loading}
          className="rounded-lg"
        />
        <Button
          size="sm"
          variant={changed ? "default" : "outline"}
          className="rounded-lg gap-1 shrink-0"
          onClick={handleSave}
          disabled={saving || loading || !changed}
        >
          {saving ? <SigmaSpinner size="sm" /> : changed ? <Save className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {changed ? "Сохранить" : "Сохранено"}
        </Button>
      </div>
    </div>
  );
}
