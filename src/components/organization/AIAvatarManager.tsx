import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sparkles, Plus, Pencil, Copy, Trash2, Search, BookOpen, Mic, Clock, Image as ImageIcon, ExternalLink } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { AIAvatarLessonEditor, defaultAIAvatarConfig, type AIAvatarConfig } from "@/components/course-builder/AIAvatarLessonEditor";

interface Template {
  id: string;
  organization_id: string;
  name: string;
  image_url: string | null;
  voice_id: string;
  system_prompt: string;
  greeting: string;
  subject: string;
  style: string;
  session_minutes: number;
  model: string;
  is_active: boolean;
  created_at: string;
  // LiveKit Agents pipeline
  stt_provider?: string | null;
  stt_model?: string | null;
  llm_provider?: string | null;
  llm_model?: string | null;
  tts_provider?: string | null;
  tts_voice?: string | null;
  language?: string | null;
  allow_interruptions?: boolean | null;
}

interface LessonRow {
  id: string;
  title: string;
  course_id: string;
  ai_avatar_name: string | null;
  ai_avatar_image_url: string | null;
  ai_avatar_session_minutes: number | null;
  courses?: { id: string; title: string } | null;
}

interface Props {
  organizationId: string;
}

const STYLE_LABELS: Record<string, string> = {
  friendly: "Дружелюбный",
  strict: "Строгий",
  mentor: "Наставник",
  peer: "На равных",
};

export function AIAvatarManager({ organizationId }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"templates" | "lessons">("templates");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [config, setConfig] = useState<AIAvatarConfig>(defaultAIAvatarConfig);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [tplRes, lessonRes] = await Promise.all([
      supabase
        .from("ai_avatar_templates" as any)
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("lessons")
        .select("id, title, course_id, ai_avatar_name, ai_avatar_image_url, ai_avatar_session_minutes, courses!inner(id, title, organization_id)")
        .eq("type", "ai_avatar")
        .eq("courses.organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);
    setTemplates(((tplRes.data as any[]) || []) as Template[]);
    setLessons(((lessonRes.data as any[]) || []) as LessonRow[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditingId(null);
    setEditingName("Новый ИИ-преподаватель");
    setConfig({ ...defaultAIAvatarConfig });
    setEditorOpen(true);
  };

  const openEdit = (tpl: Template) => {
    setEditingId(tpl.id);
    setEditingName(tpl.name);
    setConfig({
      ai_avatar_name: tpl.name,
      ai_avatar_image_url: tpl.image_url || "",
      ai_avatar_voice_id: tpl.voice_id,
      ai_avatar_system_prompt: tpl.system_prompt,
      ai_avatar_greeting: tpl.greeting,
      ai_avatar_subject: tpl.subject,
      ai_avatar_style: tpl.style,
      ai_avatar_session_minutes: tpl.session_minutes,
      ai_avatar_model: tpl.model,
      ai_avatar_stt_provider: tpl.stt_provider || "deepgram",
      ai_avatar_stt_model: tpl.stt_model || "nova-2",
      ai_avatar_llm_provider: tpl.llm_provider || "openai",
      ai_avatar_llm_model: tpl.llm_model || "gpt-4o-mini",
      ai_avatar_tts_provider: tpl.tts_provider || "elevenlabs",
      ai_avatar_tts_voice: tpl.tts_voice || "EXAVITQu4vr4xnSDxMaL",
      ai_avatar_language: tpl.language || "ru",
      ai_avatar_allow_interruptions: tpl.allow_interruptions ?? true,
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        name: config.ai_avatar_name || editingName || "Безымянный преподаватель",
        image_url: config.ai_avatar_image_url || null,
        voice_id: config.ai_avatar_voice_id,
        system_prompt: config.ai_avatar_system_prompt,
        greeting: config.ai_avatar_greeting,
        subject: config.ai_avatar_subject,
        style: config.ai_avatar_style,
        session_minutes: config.ai_avatar_session_minutes,
        model: config.ai_avatar_model,
        stt_provider: config.ai_avatar_stt_provider,
        stt_model: config.ai_avatar_stt_model,
        llm_provider: config.ai_avatar_llm_provider,
        llm_model: config.ai_avatar_llm_model,
        tts_provider: config.ai_avatar_tts_provider,
        tts_voice: config.ai_avatar_tts_voice,
        language: config.ai_avatar_language,
        allow_interruptions: config.ai_avatar_allow_interruptions,
      };
      if (editingId) {
        const { error } = await supabase.from("ai_avatar_templates" as any).update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Шаблон обновлён");
      } else {
        const { error } = await supabase.from("ai_avatar_templates" as any).insert(payload);
        if (error) throw error;
        toast.success("Шаблон создан");
      }
      setEditorOpen(false);
      fetchAll();
    } catch (e: any) {
      toast.error("Ошибка сохранения", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (tpl: Template) => {
    const { error } = await supabase.from("ai_avatar_templates" as any).insert({
      organization_id: organizationId,
      name: `${tpl.name} (копия)`,
      image_url: tpl.image_url,
      voice_id: tpl.voice_id,
      system_prompt: tpl.system_prompt,
      greeting: tpl.greeting,
      subject: tpl.subject,
      style: tpl.style,
      session_minutes: tpl.session_minutes,
      model: tpl.model,
      stt_provider: tpl.stt_provider,
      stt_model: tpl.stt_model,
      llm_provider: tpl.llm_provider,
      llm_model: tpl.llm_model,
      tts_provider: tpl.tts_provider,
      tts_voice: tpl.tts_voice,
      language: tpl.language,
      allow_interruptions: tpl.allow_interruptions,
    });
    if (error) { toast.error("Ошибка"); return; }
    toast.success("Дублировано");
    fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("ai_avatar_templates" as any).delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) { toast.error("Ошибка удаления"); return; }
    toast.success("Удалено");
    fetchAll();
  };

  const filteredTemplates = templates.filter((t) =>
    !search.trim() || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase())
  );
  const filteredLessons = lessons.filter((l) =>
    !search.trim() || l.title.toLowerCase().includes(search.toLowerCase()) || (l.courses?.title || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-5 rounded-2xl bg-gradient-to-br from-fuchsia-500/10 via-pink-500/8 to-transparent border border-fuchsia-500/20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500 flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              ИИ-преподаватели
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">БЕТА</Badge>
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground">Готовые личности виртуальных преподавателей для уроков курсов</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white border-0 rounded-xl">
          <Plus className="w-4 h-4" /> Создать преподавателя
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
          <TabsList>
            <TabsTrigger value="templates" className="gap-2">
              <Sparkles className="w-4 h-4" /> Шаблоны <Badge variant="secondary" className="ml-1">{templates.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="lessons" className="gap-2">
              <BookOpen className="w-4 h-4" /> В уроках <Badge variant="secondary" className="ml-1">{lessons.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск…" className="pl-9 h-9" />
          </div>
        </div>

        <TabsContent value="templates" className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><SigmaSpinner /></div>
          ) : filteredTemplates.length === 0 ? (
            <Card className="p-10 text-center border-dashed">
              <Sparkles className="w-12 h-12 text-fuchsia-500/40 mx-auto mb-3" />
              <h3 className="font-semibold text-lg">Нет шаблонов</h3>
              <p className="text-sm text-muted-foreground mb-4">Создайте первого ИИ-преподавателя — задайте имя, голос, поведение и используйте его в любом уроке курса.</p>
              <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Создать первого</Button>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTemplates.map((tpl) => (
                <Card key={tpl.id} className="p-4 hover:shadow-md transition group">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0 ring-2 ring-fuchsia-500/20">
                      {tpl.image_url ? (
                        <img src={tpl.image_url} alt={tpl.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20">
                          <ImageIcon className="w-6 h-6 text-fuchsia-500/60" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{tpl.name}</h3>
                      {tpl.subject && <p className="text-xs text-muted-foreground truncate">{tpl.subject}</p>}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <Badge variant="secondary" className="text-[10px] gap-1"><Mic className="w-2.5 h-2.5" />{tpl.voice_id}</Badge>
                        <Badge variant="outline" className="text-[10px]">{STYLE_LABELS[tpl.style] || tpl.style}</Badge>
                        <Badge variant="outline" className="text-[10px] gap-1"><Clock className="w-2.5 h-2.5" />{tpl.session_minutes}м</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-3 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition">
                    <Button size="sm" variant="ghost" className="flex-1 gap-1.5" onClick={() => openEdit(tpl)}>
                      <Pencil className="w-3.5 h-3.5" /> Изменить
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => handleDuplicate(tpl)} title="Дублировать">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive gap-1.5" onClick={() => setDeleteId(tpl.id)} title="Удалить">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="lessons" className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><SigmaSpinner /></div>
          ) : filteredLessons.length === 0 ? (
            <Card className="p-10 text-center border-dashed">
              <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-semibold text-lg">Пока нет ИИ-уроков</h3>
              <p className="text-sm text-muted-foreground">Откройте конструктор курса и добавьте урок типа «ИИ-аватар».</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredLessons.map((l) => (
                <Card key={l.id} className="p-3 flex items-center gap-3 hover:shadow-sm transition">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0">
                    {l.ai_avatar_image_url ? (
                      <img src={l.ai_avatar_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20">
                        <Sparkles className="w-5 h-5 text-fuchsia-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{l.title}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.ai_avatar_name || "Без имени"} • {l.courses?.title || "Курс"} • {l.ai_avatar_session_minutes || 5} мин
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/organization/course-builder/${l.course_id}?lesson=${l.id}`)}>
                    <ExternalLink className="w-3.5 h-3.5" /> Открыть
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-fuchsia-500" />
              {editingId ? "Редактировать преподавателя" : "Новый ИИ-преподаватель"}
            </DialogTitle>
          </DialogHeader>
          <AIAvatarLessonEditor
            value={config}
            onChange={setConfig}
            courseId={organizationId}
            courseTitle="Шаблон преподавателя"
            lessonTitle={config.ai_avatar_name || "Преподаватель"}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-border sticky bottom-0 bg-background">
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white border-0">
              {saving ? <SigmaSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
              {editingId ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить шаблон?</AlertDialogTitle>
            <AlertDialogDescription>
              Уроки, в которых уже скопированы настройки этого преподавателя, продолжат работать. Удаление повлияет только на библиотеку шаблонов.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
