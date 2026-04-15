import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, Copy, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface RegistrationLink {
  id: string;
  token: string;
  name: string | null;
  inn: string | null;
  expires_at: string | null;
  used_count: number;
  created_at: string;
}

interface LinksTabProps {
  organizationId: string;
  onCreateLinkClick: () => void;
}

export function LinksTab({ organizationId, onCreateLinkClick }: LinksTabProps) {
  const [registrationLinks, setRegistrationLinks] = useState<RegistrationLink[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);

  useEffect(() => {
    const fetchLinks = async () => {
      if (!organizationId) return;
      setIsLoadingLinks(true);
      try {
        const { data, error } = await supabase
          .from("registration_links")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setRegistrationLinks(data || []);
      } catch (error) {
        console.error("Error fetching links:", error);
      } finally {
        setIsLoadingLinks(false);
      }
    };
    fetchLinks();
  }, [organizationId]);

  const copyLinkToClipboard = (token: string) => {
    const link = `${getBaseUrl()}/join/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Ссылка скопирована");
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      const { error } = await supabase
        .from("registration_links")
        .delete()
        .eq("id", linkId);
      if (error) throw error;
      setRegistrationLinks(registrationLinks.filter((l) => l.id !== linkId));
      toast.success("Ссылка удалена");
    } catch (error) {
      console.error("Error deleting link:", error);
      toast.error("Ошибка удаления ссылки");
    }
  };

  if (isLoadingLinks) {
    return (
      <div className="bg-card rounded-xl lg:rounded-2xl border border-border">
        <div className="p-4 lg:p-6 border-b border-border">
          <h2 className="font-display text-lg lg:text-xl font-semibold">Ссылки для регистрации</h2>
          <p className="text-xs lg:text-sm text-muted-foreground mt-1">
            Ученики автоматически привяжутся к вашей организации
          </p>
        </div>
        <div className="flex items-center justify-center py-12">
          <SigmaSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (registrationLinks.length === 0) {
    return (
      <div className="bg-card rounded-xl lg:rounded-2xl border border-border">
        <div className="p-4 lg:p-6 border-b border-border">
          <h2 className="font-display text-lg lg:text-xl font-semibold">Ссылки для регистрации</h2>
          <p className="text-xs lg:text-sm text-muted-foreground mt-1">
            Ученики автоматически привяжутся к вашей организации
          </p>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <Link className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Нет ссылок для регистрации</p>
          <Button className="mt-4 btn-gradient rounded-xl gap-2" onClick={onCreateLinkClick}>
            <Plus className="w-4 h-4" />
            Создать первую ссылку
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl lg:rounded-2xl border border-border">
      <div className="p-4 lg:p-6 border-b border-border">
        <h2 className="font-display text-lg lg:text-xl font-semibold">Ссылки для регистрации</h2>
        <p className="text-xs lg:text-sm text-muted-foreground mt-1">
          Ученики автоматически привяжутся к вашей организации
        </p>
      </div>

      {/* Mobile view - cards */}
      <div className="lg:hidden divide-y divide-border">
        {registrationLinks.map((link) => (
          <div key={link.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{link.name || "Без названия"}</div>
                {link.inn && <div className="text-xs text-muted-foreground">ИНН: {link.inn}</div>}
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                {link.used_count} исп.
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Создана: {new Date(link.created_at).toLocaleDateString()}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg gap-1 flex-1 text-xs"
                onClick={() => copyLinkToClipboard(link.token)}
              >
                <Copy className="w-3 h-3" />
                Копировать
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-destructive hover:text-destructive"
                onClick={() => handleDeleteLink(link.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop view - table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Компания</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">ИНН</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Использований</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Создана</th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
            </tr>
          </thead>
          <tbody>
            {registrationLinks.map((link) => (
              <tr
                key={link.id}
                className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
              >
                <td className="px-6 py-4 font-medium">{link.name || "—"}</td>
                <td className="px-6 py-4 text-sm">{link.inn || "—"}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {link.used_count}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {new Date(link.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg gap-1"
                      onClick={() => copyLinkToClipboard(link.token)}
                    >
                      <Copy className="w-4 h-4" />
                      Копировать
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-destructive hover:text-destructive"
                      onClick={() => handleDeleteLink(link.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
