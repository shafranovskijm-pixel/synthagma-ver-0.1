import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Briefcase, Pencil, Trash2, Send, ExternalLink, MailOpen, Mail } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useOrgContractTemplates, useOrgContracts, type OrgContractTemplate } from "@/hooks/useOrgContracts";
import { OrgContractTemplateEditor } from "./OrgContractTemplateEditor";
import { CreateContractDialog } from "./CreateContractDialog";

interface Props { organizationId: string }

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  draft: { label: "Черновик", variant: "secondary" },
  sent: { label: "Отправлен", variant: "outline" },
  in_review: { label: "На рассмотрении", variant: "outline" },
  changes_requested: { label: "Запрошены правки", variant: "destructive" },
  signed: { label: "Подписан", variant: "default" },
  rejected: { label: "Отклонён", variant: "destructive" },
  expired: { label: "Истёк", variant: "secondary" },
};

export function OrgContractsManager({ organizationId }: Props) {
  const { templates, loading: tLoading, upsert, remove } = useOrgContractTemplates(organizationId);
  const { contracts, loading: cLoading } = useOrgContracts(organizationId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<OrgContractTemplate | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const openNewTpl = () => { setEditingTpl(null); setEditorOpen(true); };
  const openEditTpl = (t: OrgContractTemplate) => { setEditingTpl(t); setEditorOpen(true); };

  return (
    <Tabs defaultValue="contracts" className="w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <TabsList>
          <TabsTrigger value="contracts">На подписании</TabsTrigger>
          <TabsTrigger value="templates">Шаблоны договоров</TabsTrigger>
        </TabsList>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Send className="w-4 h-4" />Создать договор
          </Button>
        </div>
      </div>

      <TabsContent value="contracts" className="mt-4">
        <Card>
          <CardContent className="p-0">
            {cLoading ? (
              <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
            ) : contracts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground space-y-2">
                <Briefcase className="w-10 h-10 mx-auto text-primary/60" />
                <p className="font-medium">Пока нет договоров</p>
                <p className="text-sm">Нажмите «Создать договор» чтобы отправить первый документ на подписание.</p>
              </div>
            ) : (
              <div className="divide-y">
                {contracts.map(c => {
                  const st = STATUS_LABELS[c.status] || { label: c.status, variant: "outline" };
                  const signUrl = `${window.location.origin}/sign/${c.signature_token}`;
                  return (
                    <div key={c.id} className="p-4 flex items-center justify-between gap-4 hover:bg-muted/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{c.document_title}</p>
                          <Badge variant={st.variant}>{st.label}</Badge>
                          {c.email_opened_at && (
                            <Badge variant="outline" className="gap-1">
                              <MailOpen className="w-3 h-3" />Открыто
                            </Badge>
                          )}
                          {!c.email_opened_at && c.sent_at && (
                            <Badge variant="outline" className="gap-1 opacity-60">
                              <Mail className="w-3 h-3" />Отправлено
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {c.recipient_name} • {c.recipient_email}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Создан {format(new Date(c.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                          {c.signed_at && ` • Подписан ${format(new Date(c.signed_at), "d MMM HH:mm", { locale: ru })}`}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={signUrl} target="_blank" rel="noreferrer" className="gap-1">
                          <ExternalLink className="w-4 h-4" />Открыть
                        </a>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="templates" className="mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Шаблоны договоров</CardTitle>
            <Button size="sm" variant="outline" onClick={openNewTpl} className="gap-2">
              <Plus className="w-4 h-4" />Новый шаблон
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {tLoading ? (
              <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
            ) : templates.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Нет шаблонов. Создайте первый, чтобы быстрее формировать договоры.
              </div>
            ) : (
              <div className="divide-y">
                {templates.map(t => (
                  <div key={t.id} className="p-3 flex items-center justify-between hover:bg-muted/30">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Обновлён {format(new Date(t.updated_at), "d MMM yyyy", { locale: ru })}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditTpl(t)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm("Удалить шаблон?")) remove(t.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <OrgContractTemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTpl}
        onSave={upsert}
      />
      <CreateContractDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
      />
    </Tabs>
  );
}
