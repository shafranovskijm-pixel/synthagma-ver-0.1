import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Send, Users, ArrowLeft, UserPlus, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { ChatAvatar } from "./ChatAvatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface ChatGroup {
  id: string;
  organization_id: string;
  name: string;
  created_by: string;
  created_at: string;
  memberCount?: number;
}

interface GroupMessage {
  id: string;
  group_id: string;
  sender_user_id: string;
  content: string | null;
  created_at: string;
}

interface GroupMember {
  user_id: string;
  full_name: string;
}

interface ChatGroupsPanelProps {
  organizationId: string;
  currentUserId: string;
}

export function ChatGroupsPanel({ organizationId, currentUserId }: ChatGroupsPanelProps) {
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [orgUsers, setOrgUsers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { loadGroups(); }, [organizationId]);

  const loadGroups = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("chat_groups")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    setGroups((data || []) as ChatGroup[]);
    setIsLoading(false);
  };

  const loadGroupMessages = async (groupId: string) => {
    const { data } = await supabase
      .from("chat_group_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(500);
    const msgs = (data || []) as GroupMessage[];
    setMessages(msgs);

    const senderIds = [...new Set(msgs.map(m => m.sender_user_id))];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, full_name, email").in("user_id", senderIds);
      const map = new Map<string, string>();
      for (const p of profiles || []) map.set(p.user_id, p.full_name || p.email || "");
      setProfilesMap(prev => {
        const next = new Map(prev);
        map.forEach((v, k) => next.set(k, v));
        return next;
      });
    }
    setTimeout(scrollToBottom, 100);
  };

  const loadMembers = async (groupId: string) => {
    const { data } = await supabase
      .from("chat_group_members")
      .select("user_id")
      .eq("group_id", groupId);
    const userIds = (data || []).map(d => d.user_id);
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, full_name").in("user_id", userIds);
      setMembers((profiles || []).map(p => ({ user_id: p.user_id, full_name: p.full_name || "" })));
    } else {
      setMembers([]);
    }
  };

  useEffect(() => {
    if (!selectedGroupId) return;
    loadGroupMessages(selectedGroupId);
    const channel = supabase
      .channel(`group-chat-${selectedGroupId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "chat_group_messages",
        filter: `group_id=eq.${selectedGroupId}`,
      }, (payload) => {
        const msg = payload.new as GroupMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        if (!profilesMap.has(msg.sender_user_id)) {
          supabase.from("profiles").select("full_name, email").eq("user_id", msg.sender_user_id).maybeSingle()
            .then(({ data }) => {
              if (data) setProfilesMap(prev => new Map(prev).set(msg.sender_user_id, data.full_name || data.email || ""));
            });
        }
        setTimeout(scrollToBottom, 100);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedGroupId]);

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    const { data, error } = await supabase.from("chat_groups").insert({
      organization_id: organizationId,
      name: newGroupName.trim(),
      created_by: currentUserId,
    }).select().single();
    if (error) { toast.error("Ошибка создания группы"); return; }
    if (data) {
      // Add creator as member
      await supabase.from("chat_group_members").insert({ group_id: data.id, user_id: currentUserId });
      setGroups(prev => [data as ChatGroup, ...prev]);
    }
    setNewGroupName("");
    setShowCreateDialog(false);
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !selectedGroupId) return;
    setIsSending(true);
    try {
      const tempId = crypto.randomUUID();
      const optimistic: GroupMessage = {
        id: tempId, group_id: selectedGroupId, sender_user_id: currentUserId,
        content: text, created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, optimistic]);
      setNewMessage("");
      setTimeout(scrollToBottom, 50);

      const { data, error } = await supabase.from("chat_group_messages").insert({
        group_id: selectedGroupId, sender_user_id: currentUserId, content: text,
      }).select().single();
      if (error) throw error;
      if (data) setMessages(prev => prev.map(m => m.id === tempId ? (data as GroupMessage) : m));
    } catch { toast.error("Ошибка отправки"); }
    finally { setIsSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const loadOrgUsers = async () => {
    const { data } = await supabase.from("profiles").select("user_id, full_name")
      .eq("organization_id", organizationId).not("full_name", "is", null).order("full_name");
    setOrgUsers(data || []);
  };

  const handleOpenMembers = () => {
    if (!selectedGroupId) return;
    loadMembers(selectedGroupId);
    loadOrgUsers();
    setShowMembersDialog(true);
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedGroupId) return;
    const { error } = await supabase.from("chat_group_members").insert({ group_id: selectedGroupId, user_id: userId });
    if (error) { toast.error("Ошибка добавления"); return; }
    loadMembers(selectedGroupId);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroupId) return;
    await supabase.from("chat_group_members").delete().eq("group_id", selectedGroupId).eq("user_id", userId);
    loadMembers(selectedGroupId);
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const filteredOrgUsers = orgUsers.filter(u =>
    !members.some(m => m.user_id === u.user_id) &&
    u.user_id !== currentUserId &&
    (!memberSearch || u.full_name?.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  if (isLoading) return <div className="flex justify-center py-12"><SigmaSpinner /></div>;

  return (
    <div className="flex gap-4 h-full">
      {/* Groups list */}
      <div className={`flex flex-col ${selectedGroupId ? "w-72 shrink-0" : "flex-1 max-w-sm"} border border-border rounded-xl bg-card overflow-hidden`}>
        <div className="p-3 border-b border-border flex items-center gap-2">
          <h3 className="font-semibold text-sm flex-1">Мои группы</h3>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Нет групп</p>
              <p className="text-xs mt-1">Создайте первую группу</p>
            </div>
          ) : groups.map(g => (
            <button key={g.id} onClick={() => handleSelectGroup(g.id)}
              className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${selectedGroupId === g.id ? "bg-primary/5" : ""}`}>
              <div className="flex items-center gap-3">
                <ChatAvatar name={g.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-sm truncate block">{g.name}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Группа</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Group chat */}
      {selectedGroupId && selectedGroup && (
        <div className="flex-1 border border-border rounded-xl bg-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center gap-3">
            <ChatAvatar name={selectedGroup.name} size="sm" />
            <h3 className="font-semibold flex-1">{selectedGroup.name}</h3>
            <Button variant="ghost" size="sm" onClick={handleOpenMembers} className="gap-1">
              <UserPlus className="w-4 h-4" /> Участники
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Начните общение в группе</p>
              </div>
            ) : messages.map(msg => {
              const isMine = msg.sender_user_id === currentUserId;
              const senderName = profilesMap.get(msg.sender_user_id) || "...";
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  {!isMine && (
                    <div className="mr-2 mt-1 shrink-0">
                      <ChatAvatar name={senderName} size="sm" />
                    </div>
                  )}
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isMine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                  }`}>
                    {!isMine && <div className="text-[10px] font-medium mb-1 opacity-70">{senderName}</div>}
                    {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                    <div className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {format(new Date(msg.created_at), "HH:mm", { locale: ru })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-border p-3 flex items-end gap-2">
            <Textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Написать в группу..." className="min-h-[40px] max-h-[120px] rounded-xl resize-none" rows={1} />
            <Button size="icon" className="shrink-0 rounded-xl" onClick={handleSend} disabled={isSending || !newMessage.trim()}>
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Create group dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Создать группу</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              placeholder="Название группы" autoFocus onKeyDown={e => e.key === "Enter" && handleCreateGroup()} />
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()} className="w-full">Создать</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Участники группы</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Текущие участники</p>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Нет участников</p>
              ) : members.map(m => (
                <div key={m.user_id} className="flex items-center gap-2 py-1.5">
                  <ChatAvatar name={m.full_name} size="sm" />
                  <span className="text-sm flex-1">{m.full_name}</span>
                  {m.user_id !== currentUserId && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveMember(m.user_id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Добавить участника</p>
              <Input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Поиск..." className="h-8" />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredOrgUsers.map(u => (
                  <button key={u.user_id} onClick={() => handleAddMember(u.user_id)}
                    className="w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/50 text-left">
                    <ChatAvatar name={u.full_name || "?"} size="sm" />
                    <span className="text-sm">{u.full_name}</span>
                    <Plus className="w-3 h-3 ml-auto text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
