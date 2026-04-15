import { Button } from "@/components/ui/button";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import {
  Link2,
  Plus,
  Copy,
  Trash2,
  Calendar,
  Users,
  Check } from "lucide-react";
import { toast } from "sonner";
import type { Company } from "@/hooks/useCompaniesManager";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface CompanyLink {
  id: string;
  token: string;
  name: string | null;
  expires_at: string | null;
  used_count: number;
}

interface CompanyLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  links: CompanyLink[];
  isLoading: boolean;
  isCreating: boolean;
  newLinkName: string;
  setNewLinkName: (name: string) => void;
  newLinkExpiresDays: string;
  setNewLinkExpiresDays: (days: string) => void;
  onCreateLink: () => void;
  onDeleteLink: (linkId: string) => void;
}

export function CompanyLinksDialog({
  open,
  onOpenChange,
  company,
  links,
  isLoading,
  isCreating,
  newLinkName,
  setNewLinkName,
  newLinkExpiresDays,
  setNewLinkExpiresDays,
  onCreateLink,
  onDeleteLink }: CompanyLinksDialogProps) {
  const copyLink = (token: string) => {
    const url = `${getBaseUrl()}/join/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована");
  };

  const isLinkExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Link2 className="w-5 h-5 text-blue-500" />
            Ссылки для регистрации
          </DialogTitle>
          <DialogDescription>
            Создайте ссылку для регистрации учеников в компанию «{company?.name}»
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Create new link */}
          <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium">Создать новую ссылку</div>
            <div className="flex gap-3">
              <Input
                placeholder="Название (например: Группа 2024)"
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                className="flex-1 rounded-xl"
              />
              <Input
                type="number"
                placeholder="Дней"
                value={newLinkExpiresDays}
                onChange={(e) => setNewLinkExpiresDays(e.target.value)}
                className="w-24 rounded-xl"
              />
              <Button
                className="btn-gradient rounded-xl gap-2"
                onClick={onCreateLink}
                disabled={isCreating}
              >
                {isCreating ? (
                  <SigmaSpinner size="sm" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Создать
                  </>
                )}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Оставьте поле "Дней" пустым для бессрочной ссылки
            </div>
          </div>

          {/* Links list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <SigmaSpinner size="lg" />
              </div>
            ) : links.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Нет ссылок для этой компании</p>
                <p className="text-sm">Создайте первую ссылку выше</p>
              </div>
            ) : (
              <div className="space-y-3">
                {links.map((link) => {
                  const expired = isLinkExpired(link.expires_at);
                  return (
                    <div
                      key={link.id}
                      className={`flex items-center justify-between p-4 rounded-xl border ${
                        expired
                          ? "bg-muted/50 border-muted opacity-60"
                          : "bg-card border-border"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            expired
                              ? "bg-muted text-muted-foreground"
                              : "bg-blue-500/10 text-blue-500"
                          }`}
                        >
                          <Link2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium">
                            {link.name || "Ссылка без названия"}
                            {expired && (
                              <span className="text-xs text-destructive ml-2">
                                (истекла)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {link.used_count} переходов
                            </span>
                            {link.expires_at && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                до {new Date(link.expires_at).toLocaleDateString("ru-RU")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-lg"
                          onClick={() => copyLink(link.token)}
                          disabled={expired}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-lg text-destructive hover:text-destructive"
                          onClick={() => onDeleteLink(link.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
