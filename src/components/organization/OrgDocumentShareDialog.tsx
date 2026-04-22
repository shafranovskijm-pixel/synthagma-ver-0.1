import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOrgDocumentShareLinks } from "@/hooks/useOrgDocumentShareLinks";
import { toast } from "sonner";
import { Copy, Link2, Trash2, Ban, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface OrgDocumentShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string | null;
  documentName: string;
  organizationId: string;
}

export function OrgDocumentShareDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  organizationId,
}: OrgDocumentShareDialogProps) {
  const { links, loading, createLink, revokeLink, deleteLink } = useOrgDocumentShareLinks(documentId);
  const [expiresInDays, setExpiresInDays] = useState<string>("7");
  const [maxDownloads, setMaxDownloads] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const buildPublicUrl = (token: string) =>
    `${window.location.origin}/document/share/${token}`;

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(buildPublicUrl(token));
    toast.success("Ссылка скопирована");
  };

  const handleCreate = async () => {
    setCreating(true);
    await createLink({
      organizationId,
      expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : null,
      maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : null,
    });
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Публичные ссылки: {documentName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 border-b border-border pb-4">
          <div>
            <Label className="text-xs">Срок действия (дней)</Label>
            <Input
              type="number"
              min={1}
              placeholder="оставьте пустым = бессрочно"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Лимит скачиваний</Label>
            <Input
              type="number"
              min={1}
              placeholder="оставьте пустым = без лимита"
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="col-span-2"
          >
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
            Создать ссылку
          </Button>
        </div>

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Нет публичных ссылок
            </div>
          ) : (
            <div className="space-y-2">
              {links.map((l) => {
                const expired = l.expires_at && new Date(l.expires_at) < new Date();
                const limited = l.max_downloads && l.download_count >= l.max_downloads;
                const dead = !l.is_active || expired || limited;
                return (
                  <div
                    key={l.id}
                    className="p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {!l.is_active && <Badge variant="destructive">Отозвана</Badge>}
                      {expired && <Badge variant="secondary">Истекла</Badge>}
                      {limited && <Badge variant="secondary">Лимит</Badge>}
                      {!dead && <Badge className="bg-green-500/15 text-green-600 border-green-500/30">Активна</Badge>}
                      <span className="text-xs text-muted-foreground">
                        Скачана: {l.download_count}{l.max_downloads ? ` / ${l.max_downloads}` : ""}
                      </span>
                      {l.expires_at && (
                        <span className="text-xs text-muted-foreground">
                          до {format(new Date(l.expires_at), "d MMM yyyy", { locale: ru })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={buildPublicUrl(l.token)}
                        className="font-mono text-xs h-8"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => copyLink(l.token)}
                        disabled={dead}
                        title="Копировать"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      {l.is_active && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => revokeLink(l.id)}
                          title="Отозвать"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive"
                        onClick={() => deleteLink(l.id)}
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
