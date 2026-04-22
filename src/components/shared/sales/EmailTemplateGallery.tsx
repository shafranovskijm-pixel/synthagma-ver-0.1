import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Eye, Copy, Sparkles, Search, Mail } from "lucide-react";
import { usePlatformEmailTemplates, TEMPLATE_CATEGORIES, type EmailTemplate } from "@/hooks/useEmailTemplates";
import { cn } from "@/lib/utils";

interface Props {
  /** Вызывается при клике «Скопировать в свои» */
  onClone: (template: EmailTemplate) => Promise<unknown> | unknown;
}

const CATEGORY_GRADIENT: Record<string, string> = {
  cold: "from-sky-500/15 to-blue-500/15 border-sky-500/30",
  followup: "from-cyan-500/15 to-teal-500/15 border-cyan-500/30",
  presentation: "from-violet-500/15 to-fuchsia-500/15 border-violet-500/30",
  course_invite: "from-pink-500/15 to-rose-500/15 border-pink-500/30",
  webinar_invite: "from-amber-500/15 to-orange-500/15 border-amber-500/30",
  promo: "from-red-500/15 to-pink-500/15 border-red-500/30",
  nurture: "from-emerald-500/15 to-teal-500/15 border-emerald-500/30",
  proposal: "from-indigo-500/15 to-blue-500/15 border-indigo-500/30",
  contract: "from-slate-500/15 to-gray-500/15 border-slate-500/30",
  reactivation: "from-orange-500/15 to-red-500/15 border-orange-500/30",
  custom: "from-muted/30 to-muted/10 border-muted",
};

export function EmailTemplateGallery({ onClone }: Props) {
  const { templates, loading } = usePlatformEmailTemplates();
  const [filterCat, setFilterCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<EmailTemplate | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return templates.filter(t => {
      const okCat = filterCat === "all" || t.category === filterCat;
      const okSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.subject.toLowerCase().includes(search.toLowerCase());
      return okCat && okSearch;
    });
  }, [templates, filterCat, search]);

  const usedCategories = useMemo(() => {
    const set = new Set(templates.map(t => t.category));
    return TEMPLATE_CATEGORIES.filter(c => set.has(c.value));
  }, [templates]);

  const handleClone = async (t: EmailTemplate) => {
    setCloningId(t.id);
    try {
      await onClone(t);
    } finally {
      setCloningId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Загрузка галереи...</p>;
  }

  if (templates.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 mr-auto">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Готовые шаблоны от платформы</h3>
          <Badge variant="secondary" className="text-[10px]">{templates.length}</Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            className="pl-8 w-[200px] h-9"
          />
        </div>
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setFilterCat("all")}
          className={cn(
            "px-3 py-1 rounded-full text-xs border transition",
            filterCat === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-muted border-border"
          )}
        >
          Все ({templates.length})
        </button>
        {usedCategories.map(c => {
          const count = templates.filter(t => t.category === c.value).length;
          return (
            <button
              key={c.value}
              onClick={() => setFilterCat(c.value)}
              className={cn(
                "px-3 py-1 rounded-full text-xs border transition",
                filterCat === c.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-border"
              )}
            >
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(t => {
          const cat = TEMPLATE_CATEGORIES.find(c => c.value === t.category);
          const grad = CATEGORY_GRADIENT[t.category] || CATEGORY_GRADIENT.custom;
          return (
            <Card key={t.id} className={cn("bg-gradient-to-br border-2 hover:shadow-md transition", grad)}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm leading-tight line-clamp-2">{t.name}</h4>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</p>
                  </div>
                </div>
                {cat && <Badge variant="outline" className="text-[10px]">{cat.label}</Badge>}
                <div className="flex gap-1.5 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => setPreview(t)}>
                    <Eye className="w-3.5 h-3.5 mr-1" />Превью
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-8"
                    disabled={cloningId === t.id}
                    onClick={() => handleClone(t)}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    {cloningId === t.id ? "..." : "В свои"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-6 col-span-full text-sm">
            Нет шаблонов под выбранный фильтр
          </p>
        )}
      </div>

      {preview && (
        <Dialog open onOpenChange={() => setPreview(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                {preview.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-semibold">Тема:</span> {preview.subject}
              </div>
              <div className="border rounded-lg overflow-hidden bg-white">
                <iframe
                  srcDoc={preview.html_body}
                  title="Email preview"
                  className="w-full min-h-[500px]"
                  sandbox=""
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreview(null)}>Закрыть</Button>
                <Button
                  onClick={async () => {
                    await handleClone(preview);
                    setPreview(null);
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" />Скопировать в свои
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
