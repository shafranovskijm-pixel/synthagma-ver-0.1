import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Send, Mail, MessageCircle, Eye, KeyRound, UserCheck, UserX, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { ManagerSmtpTab } from "./ManagerSmtpTab";
import { ManagerScriptEditor } from "./ManagerScriptEditor";
import { ManagerStatsInline } from "./ManagerStatsInline";
import { setAdminSalesView } from "@/utils/adminViewMode";
import type { SalesManager } from "@/hooks/useSalesManager";

interface Props {
  manager: SalesManager | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onResetPassword: (m: SalesManager) => void;
  onToggleActive: (m: SalesManager) => void;
  onAssignTask: (m: SalesManager) => void;
}

const copy = async (text: string, label = "Скопировано") => {
  try { await navigator.clipboard.writeText(text); toast.success(label); } catch { toast.error("Не удалось скопировать"); }
};

export function ManagerProfileDrawer({ manager, open, onOpenChange, onResetPassword, onToggleActive, onAssignTask }: Props) {
  if (!manager) return null;
  const loginUrl = `${window.location.origin}/login`;
  const login = manager.email || "—";
  const pwd = manager.generated_password || "";
  const shareText = pwd
    ? `Доступ в кабинет менеджера СИНТАГМА\nФИО: ${manager.full_name}\nЛогин: ${login}\nПароль: ${pwd}\nВход: ${loginUrl}`
    : `Доступ в кабинет менеджера СИНТАГМА\nФИО: ${manager.full_name}\nЛогин: ${login}\nВход: ${loginUrl}`;

  const impersonate = () => {
    setAdminSalesView({ managerId: manager.id, userId: manager.user_id, fullName: manager.full_name, returnTo: "/admin" });
    window.location.assign("/sales");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            {manager.full_name}
            <Badge variant={manager.is_active ? "default" : "secondary"}>
              {manager.is_active ? "Активен" : "Неактивен"}
            </Badge>
          </SheetTitle>
          {manager.phone && <div className="text-xs text-muted-foreground">{manager.phone}</div>}
        </SheetHeader>

        <Tabs defaultValue="access" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full grid grid-cols-4 rounded-none border-b h-10 bg-transparent">
            <TabsTrigger value="access" className="text-xs">Доступ</TabsTrigger>
            <TabsTrigger value="smtp" className="text-xs">Рассылка (SMTP)</TabsTrigger>
            <TabsTrigger value="script" className="text-xs">Скрипт</TabsTrigger>
            <TabsTrigger value="stats" className="text-xs">Статистика</TabsTrigger>
          </TabsList>

          <TabsContent value="access" className="p-4 space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
              <Row label="Логин" value={login} onCopy={() => copy(login, "Логин скопирован")} />
              <Row
                label="Пароль"
                value={pwd || "скрыт — нажмите «Сбросить пароль»"}
                mono={!!pwd}
                onCopy={pwd ? () => copy(pwd, "Пароль скопирован") : undefined}
              />
              <Row label="Вход" value={loginUrl} onCopy={() => copy(loginUrl, "Ссылка скопирована")} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => copy(shareText, "Данные скопированы")}>
                <Copy className="w-4 h-4 mr-1" />Скопировать всё
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`https://t.me/share/url?url=${encodeURIComponent(loginUrl)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                  <Send className="w-4 h-4 mr-1" />Telegram
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="w-4 h-4 mr-1" />WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`mailto:${manager.email || ""}?subject=${encodeURIComponent("Доступ в кабинет СИНТАГМА")}&body=${encodeURIComponent(shareText)}`}>
                  <Mail className="w-4 h-4 mr-1" />Email
                </a>
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap pt-2 border-t">
              <Button size="sm" variant="outline" onClick={impersonate}>
                <Eye className="w-4 h-4 mr-1" />Войти как
              </Button>
              <Button size="sm" variant="outline" onClick={() => onResetPassword(manager)}>
                <KeyRound className="w-4 h-4 mr-1" />Сбросить пароль
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAssignTask(manager)}>
                <ListTodo className="w-4 h-4 mr-1" />Поставить задачу
              </Button>
              <Button size="sm" variant="outline" onClick={() => onToggleActive(manager)}>
                {manager.is_active ? <><UserX className="w-4 h-4 mr-1" />Деактивировать</> : <><UserCheck className="w-4 h-4 mr-1" />Активировать</>}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="smtp" className="p-4"><ManagerSmtpTab managerId={manager.id} managerFullName={manager.full_name} /></TabsContent>
          <TabsContent value="script" className="p-4"><ManagerScriptEditor managerId={manager.id} /></TabsContent>
          <TabsContent value="stats" className="p-4"><ManagerStatsInline managerId={manager.id} /></TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono = true, onCopy }: { label: string; value: string; mono?: boolean; onCopy?: () => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-muted-foreground w-16 shrink-0 text-xs">{label}</span>
      <code className={`${mono ? "font-mono" : ""} text-xs break-all flex-1 min-w-0`}>{value}</code>
      {onCopy && (
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onCopy}>
          <Copy className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
