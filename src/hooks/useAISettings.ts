import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AISetting } from "@/components/admin/ai-settings/constants";
import { API_KEYS_LIST } from "@/components/admin/ai-settings/constants";

export function useAISettings() {
  const [settings, setSettings] = useState<Record<string, AISetting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState<Record<string, boolean>>({});
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showValue, setShowValue] = useState<Record<string, boolean>>({});

  useEffect(() => { loadSettings(); }, []);

  useEffect(() => {
    const checkSecrets = async () => {
      setSecretsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("check-secrets-status", {
          body: { names: API_KEYS_LIST.map((k) => k.name) },
        });
        if (!error && data) setSecretsStatus(data);
      } catch (e) {
        console.error("Failed to check secrets status:", e);
      } finally {
        setSecretsLoading(false);
      }
    };
    checkSecrets();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("ai_settings").select("*");
    if (error) {
      toast.error("Ошибка загрузки настроек ИИ");
      console.error(error);
    } else if (data) {
      const map: Record<string, AISetting> = {};
      data.forEach((row: any) => {
        map[row.context] = {
          id: row.id,
          context: row.context,
          provider: row.provider,
          gigachat_model: row.gigachat_model || "GigaChat-Max",
          lovable_model: row.lovable_model || "google/gemini-2.5-pro",
          concurrency: row.concurrency || 3,
          extra_config: (row.extra_config as Record<string, any>) || {},
        };
      });
      setSettings(map);
    }
    setLoading(false);
  };

  const updateField = (context: string, field: keyof AISetting, value: any) => {
    setSettings((prev) => ({ ...prev, [context]: { ...prev[context], [field]: value } }));
  };

  const updateExtra = (context: string, key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [context]: { ...prev[context], extra_config: { ...prev[context].extra_config, [key]: value } },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const s of Object.values(settings)) {
        const { error } = await supabase
          .from("ai_settings")
          .update({
            provider: s.provider,
            gigachat_model: s.gigachat_model,
            lovable_model: s.lovable_model,
            concurrency: s.concurrency,
            extra_config: s.extra_config,
            updated_at: new Date().toISOString(),
          })
          .eq("id", s.id);
        if (error) throw error;
      }
      toast.success("Настройки ИИ сохранены");
    } catch (e: any) {
      toast.error("Ошибка сохранения: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKey = async (name: string) => {
    if (!editValue.trim()) { toast.error("Введите значение ключа"); return; }
    setSavingKey(name);
    try {
      const { data, error } = await supabase.functions.invoke("manage-secret", {
        body: { action: "set", name, value: editValue.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Ключ ${name} сохранён`);
      setSecretsStatus((prev) => ({ ...prev, [name]: true }));
      setEditingKey(null);
      setEditValue("");
    } catch (e: any) {
      toast.error(e.message || "Ошибка сохранения ключа");
    } finally {
      setSavingKey(null);
    }
  };

  return {
    settings, loading, saving, secretsStatus, secretsLoading,
    editingKey, setEditingKey, editValue, setEditValue,
    savingKey, showValue, setShowValue,
    updateField, updateExtra, handleSave, handleSaveKey,
  };
}
