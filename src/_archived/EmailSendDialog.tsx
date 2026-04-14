import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Eye, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";

interface EmailSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultMessage?: string;
  htmlContent?: string;
  organizationName?: string;
}

export function EmailSendDialog({
  open,
  onOpenChange,
  defaultTo = "",
  defaultSubject = "",
  defaultMessage = "",
  htmlContent = "",
  organizationName = "",
}: EmailSendDialogProps) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState("compose");

  useState(() => {
    if (open) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setMessage(defaultMessage);
    }
  });

  const generateFullHtml = () => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
          .email-header { margin-bottom: 20px; }
          .email-content { margin-bottom: 30px; }
          .email-signature { color: #666; border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px; }
          .document-container { margin-top: 30px; border-top: 2px solid #e5e7eb; padding-top: 30px; }
        </style>
      </head>
      <body>
        <div class="email-header">
          <p>${message.replace(/\n/g, '<br>')}</p>
        </div>
        ${organizationName ? `
          <div class="email-signature">
            <p>С уважением,<br><strong>${organizationName}</strong></p>
          </div>
        ` : ''}
        ${htmlContent ? `
          <div class="document-container">
            ${htmlContent}
          </div>
        ` : ''}
      </body>
      </html>
    `;
  };

  const handleSend = async () => {
    if (!to || !to.includes("@")) {
      toast.error("Введите корректный email");
      return;
    }
    if (!subject.trim()) {
      toast.error("Введите тему письма");
      return;
    }
    if (!message.trim() && !htmlContent) {
      toast.error("Введите текст сообщения");
      return;
    }

    setIsSending(true);
    try {
      const { error } = await safeInvoke<any>("send-email", {
        body: {
          to,
          subject,
          html: generateFullHtml(),
        },
      });

      if (error) throw error;
      toast.success(`Письмо отправлено на ${to}`);
      onOpenChange(false);
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error("Ошибка отправки письма");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Отправка письма
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Написать
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Предпросмотр
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="flex-1 overflow-auto space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="to">Кому</Label>
              <Input
                id="to"
                type="email"
                placeholder="email@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Тема</Label>
              <Input
                id="subject"
                placeholder="Тема письма"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Сообщение</Label>
              <Textarea
                id="message"
                placeholder="Текст сообщения..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
              />
            </div>

            {htmlContent && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                  Документ будет прикреплён к письму
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-auto mt-4">
            <div className="border rounded-lg bg-white">
              <div className="border-b p-4 bg-muted/30">
                <div className="text-sm space-y-1">
                  <p><strong>Кому:</strong> {to || "—"}</p>
                  <p><strong>Тема:</strong> {subject || "—"}</p>
                </div>
              </div>
              <div className="p-4">
                <iframe
                  srcDoc={generateFullHtml()}
                  className="w-full min-h-[400px] border-0"
                  title="Email preview"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Отправка...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Отправить
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}