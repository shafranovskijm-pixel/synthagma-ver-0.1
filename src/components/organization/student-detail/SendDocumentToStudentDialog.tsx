import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Loader2, ArrowRight, FilePlus2 } from "lucide-react";
import { useOrgContractTemplates } from "@/hooks/useOrgContracts";
import { renderTemplate, type TemplateVariables } from "@/lib/templateRenderer";
import { SendForSigningDialog, type SendForSigningPayload, type SigningRecipientType } from "@/components/signing/SendForSigningDialog";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  student: { user_id: string; name: string; email: string };
}

/**
 * Компактный пикер шаблонов договоров для отправки выбранному ученику.
 * Подставляет ФИО/email ученика в переменные шаблона и открывает SendForSigningDialog
 * с предзаполненным получателем (recipient_user_id → попадёт в inbox ученика).
 */
export function SendDocumentToStudentDialog({ open, onOpenChange, organizationId, student }: Props) {
  const { templates, loading } = useOrgContractTemplates(organizationId);
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string>("");
  const [signingPayload, setSigningPayload] = useState<SendForSigningPayload | null>(null);

  useEffect(() => {
    if (open) setSelectedId("");
  }, [open]);

  const variables: TemplateVariables = useMemo(() => ({
    student_name: student.name,
    student_full_name: student.name,
    student_email: student.email,
    full_name: student.name,
    email: student.email,
    date: new Date().toLocaleDateString("ru-RU"),
  }), [student]);

  const handleProceed = () => {
    const tpl = templates.find(t => t.id === selectedId);
    if (!tpl) return;
    const html = renderTemplate(tpl.body_html || "", variables);
    setSigningPayload({
      documentType: "contract",
      documentTitle: tpl.name,
      documentHtml: html,
      organizationId,
    });
    onOpenChange(false);
  };

  const recipients = useMemo(() => ([{
    id: student.user_id,
    name: student.name,
    email: student.email,
    type: "student" as SigningRecipientType,
  }]), [student]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Отправить документ ученику
            </DialogTitle>
            <DialogDescription>
              Выберите шаблон договора. Документ появится в личном кабинете <span className="font-medium text-foreground">{student.name}</span> на вкладке «Документы» и продублируется письмом на {student.email}.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <FilePlus2 className="w-10 h-10 mx-auto text-muted-foreground/50" />
              <div className="text-sm text-muted-foreground">У организации пока нет шаблонов договоров.</div>
              <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); navigate("/organization?tab=documents"); }}>
                Создать шаблон <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Шаблон договора</Label>
              <ScrollArea className="max-h-72 rounded-lg border border-border">
                <div className="divide-y divide-border">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                        selectedId === t.id ? "bg-primary/10" : ""
                      }`}
                    >
                      <div className="text-sm font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        {t.name}
                        {t.is_default && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                            по умолч.
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={handleProceed} disabled={!selectedId} className="gap-2">
              Далее <ArrowRight className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendForSigningDialog
        open={!!signingPayload}
        onOpenChange={(v) => !v && setSigningPayload(null)}
        payload={signingPayload}
        recipients={recipients}
      />
    </>
  );
}
