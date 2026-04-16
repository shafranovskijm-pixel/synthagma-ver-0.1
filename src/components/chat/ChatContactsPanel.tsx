import { useState, useEffect } from "react";
import { Search, Contact, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { ChatAvatar } from "./ChatAvatar";
import { useAuth } from "@/hooks/useAuth";

interface ContactItem {
  user_id: string;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  role_label?: string;
}

interface ChatContactsPanelProps {
  role: "admin" | "organization" | "student";
  organizationId?: string;
  onStartChat?: (userId: string, name: string) => void;
}

export function ChatContactsPanel({ role, organizationId, onStartChat }: ChatContactsPanelProps) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadContacts();
  }, [role, organizationId]);

  const loadContacts = async () => {
    if (!user) return;
    setLoading(true);

    try {
      let query = supabase
        .from("profiles")
        .select("user_id, full_name, email, avatar_url")
        .neq("user_id", user.id)
        .not("full_name", "is", null)
        .order("full_name")
        .limit(200);

      if (role === "organization" && organizationId) {
        query = query.eq("organization_id", organizationId);
      }

      const { data } = await query;
      setContacts(
        (data || []).map(p => ({
          user_id: p.user_id,
          full_name: p.full_name || p.email || "Без имени",
          email: p.email || undefined,
          avatar_url: p.avatar_url,
        }))
      );
    } catch (err) {
      console.error("Error loading contacts:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = search
    ? contacts.filter(c =>
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  if (loading) {
    return <div className="flex justify-center py-12"><SigmaSpinner /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск контактов..."
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Contact className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{search ? "Никого не найдено" : "Нет контактов"}</p>
          </div>
        ) : (
          filtered.map(contact => (
            <button
              key={contact.user_id}
              onClick={() => onStartChat?.(contact.user_id, contact.full_name)}
              className="w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors flex items-center gap-3"
            >
              <ChatAvatar name={contact.full_name} avatarUrl={contact.avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium truncate block">{contact.full_name}</span>
                {contact.email && (
                  <span className="text-xs text-muted-foreground truncate block">{contact.email}</span>
                )}
              </div>
              {onStartChat && (
                <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
