import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Copy, Mail, Lock, Send, ChevronDown, ChevronUp } from "lucide-react";
import { useEmailTemplates, TEMPLATE_CATEGORIES, type EmailTemplate } from "@/hooks/useEmailTemplates";
import { EmailTemplateEditor } from "./EmailTemplateEditor";
import { EmailTemplateGallery } from "./EmailTemplateGallery";
import { CampaignEditor } from "@/components/admin/broadcast/CampaignEditor";

interface Props {
  scope: "platform" | "org";
  organizationId: string | null;
}

export function EmailTemplatesManager({ scope, organizationId }: Props) {
  const { templates, loading, upsert, remove, duplicate, sendTest, cloneFromPlatform } = useEmailTemplates(scope, organizationId);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [editing, setEditing] = useState<Partial<EmailTemplate> | null>(null);
  const [campaignFromTemplate, setCampaignFromTemplate] = useState<EmailTemplate | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(true);

  const filtered = filterCat === "all" ? templates : templates.filter(t => t.category === filterCat);

  return (
    <div className="space-y-4">
      {scope === "org" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <button
              onClick={() => setGalleryOpen(o => !o)}
              className="flex items-center justify-between w-full mb-2"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {galleryOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Галерея готовых продающих шаблонов
              </div>
              <span className="text-xs text-muted-foreground">
                {galleryOpen ? "свернуть" : "раскрыть"}
              </span>
            </button>
            {galleryOpen && <EmailTemplateGallery onClone={cloneFromPlatform} />}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">
          {scope === "org" ? "Мои шаблоны" : "Шаблоны email"}
        </h3>
        <div className="flex items-center gap-2">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все категории</SelectItem>
              {TEMPLATE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setEditing({})}>
            <Plus className="w-4 h-4 mr-2" />Новый шаблон
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Загрузка...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {filtered.map(t => {
          const cat = TEMPLATE_CATEGORIES.find(c => c.value === t.category);
          const locked = t.is_default && scope === "org" && t.organization_id === null;
          return (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Mail className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-medium truncate">{t.name}</span>
                      {t.is_default && <Badge variant="secondary" className="text-[10px]">системный</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                    {cat && <Badge variant="outline" className="text-[10px] mt-1">{cat.label}</Badge>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => setCampaignFromTemplate(t)} title="Запустить рассылку из шаблона">
                      <Send className="w-4 h-4 text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(t)} title="Редактировать">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => duplicate(t)} title="Дублировать">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={locked} onClick={() => remove(t.id)} title={locked ? "Системный шаблон нельзя удалить" : "Удалить"}>
                      {locked ? <Lock className="w-4 h-4 opacity-50" /> : <Trash2 className="w-4 h-4 text-destructive" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!loading && filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8 col-span-full">Нет шаблонов</p>
        )}
      </div>

      {editing && (
        <EmailTemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSave={upsert}
          onSendTest={sendTest}
        />
      )}

      {campaignFromTemplate && (
        <CampaignEditor
          open={true}
          onClose={() => setCampaignFromTemplate(null)}
          scope={scope}
          organizationId={organizationId}
          onCreated={() => setCampaignFromTemplate(null)}
          initial={{
            name: campaignFromTemplate.name,
            subject: campaignFromTemplate.subject,
            html: campaignFromTemplate.html_body,
          }}
        />
      )}
    </div>
  );
}
