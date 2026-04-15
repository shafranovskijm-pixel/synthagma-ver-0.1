import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webinar: { id: string; title: string };
  organizationId: string;
}

interface Participant {
  id: string;
  user_id: string;
  enrolled_at: string;
  profile?: { full_name: string | null; email: string | null };
}

export function WebinarParticipantsDialog({ open, onOpenChange, webinar, organizationId }: Props) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [students, setStudents] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchParticipants = useCallback(async () => {
    const { data } = await supabase
      .from("webinar_participants")
      .select("id, user_id")
      .eq("webinar_id", webinar.id);
    
    const items = ((data || []) as unknown as Participant[]);
    
    // Fetch profiles for participants
    if (items.length > 0) {
      const userIds = items.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      
      items.forEach(p => {
        p.profile = profiles?.find(pr => pr.user_id === p.user_id) || { full_name: null, email: null };
      });
    }
    
    setParticipants(items);
    setLoading(false);
  }, [webinar.id]);

  const fetchStudents = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("organization_id", organizationId)
      .order("full_name");
    setStudents(data || []);
  }, [organizationId]);

  useEffect(() => {
    if (open) {
      fetchParticipants();
      fetchStudents();
    }
  }, [open, fetchParticipants, fetchStudents]);

  const addParticipant = async (userId: string) => {
    const { error } = await supabase.from("webinar_participants").insert({
      webinar_id: webinar.id,
      user_id: userId } as any);
    if (error) {
      if (error.code === "23505") toast.info("Участник уже добавлен");
      else toast.error(error.message);
      return;
    }
    toast.success("Участник добавлен");
    fetchParticipants();
  };

  const removeParticipant = async (id: string) => {
    await supabase.from("webinar_participants").delete().eq("id", id);
    toast.success("Участник удалён");
    fetchParticipants();
  };

  const addAll = async () => {
    const existingIds = new Set(participants.map(p => p.user_id));
    const toAdd = students.filter(s => !existingIds.has(s.user_id));
    if (toAdd.length === 0) { toast.info("Все ученики уже добавлены"); return; }
    
    const { error } = await supabase.from("webinar_participants").insert(
      toAdd.map(s => ({ webinar_id: webinar.id, user_id: s.user_id })) as any
    );
    if (error) toast.error(error.message);
    else toast.success(`Добавлено ${toAdd.length} учеников`);
    fetchParticipants();
  };

  const filteredStudents = students.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
  });

  const participantIds = new Set(participants.map(p => p.user_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Участники: {webinar.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary">{participants.length} участников</Badge>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="w-3 h-3 mr-1" />{showAdd ? "Скрыть" : "Добавить"}
          </Button>
          <Button size="sm" variant="outline" onClick={addAll}>
            Добавить всех
          </Button>
        </div>

        {showAdd && (
          <div className="border rounded-lg p-3 space-y-2 mb-2 max-h-48 overflow-y-auto">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск учеников..." className="pl-8 h-9" />
            </div>
            {filteredStudents.map(s => (
              <div key={s.user_id} className="flex items-center justify-between py-1 px-2 text-sm">
                <span className="truncate">{s.full_name || s.email || "—"}</span>
                {participantIds.has(s.user_id) ? (
                  <Badge variant="secondary" className="text-xs">Добавлен</Badge>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => addParticipant(s.user_id)}>
                    <Plus className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {loading ? (
            <div className="flex justify-center py-8"><SigmaSpinner /></div>
          ) : participants.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Нет участников</p>
          ) : (
            participants.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.profile?.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.profile?.email}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive h-7" onClick={() => removeParticipant(p.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
