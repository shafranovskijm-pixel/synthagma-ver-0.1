import { useState, useEffect, useMemo } from "react";
import { useUrlNavigation, useUrlQueryState } from "@/hooks/useUrlNavigation";
import { MessageCircle, Search, ArrowLeft, Shield, Plus, UserPlus, X, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatTab } from "@/components/organization/student-detail/ChatTab";
import { AdminChatDialog } from "@/components/organization/AdminChatDialog";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { AiChatPanel } from "@/components/chat/AiChatPanel";
import { ColleagueChatPanel } from "@/components/chat/ColleagueChatPanel";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { ChatSidebar, type ChatSection } from "@/components/chat/ChatSidebar";
import { ChatSettingsPanel } from "@/components/chat/ChatSettingsPanel";
import { ChatRequestsPanel } from "@/components/chat/ChatRequestsPanel";
import { ChatContactsPanel } from "@/components/chat/ChatContactsPanel";
import { OrgGeneralChat } from "@/components/chat/OrgGeneralChat";
import { ChatNotificationToggle } from "@/components/chat/ChatNotificationToggle";
import { ChatGroupsPanel } from "@/components/chat/ChatGroupsPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function OrgChatsTab() {
  const d = useOrgDashboard();
  const isMobile = useIsMobile();
  const { params, updateParams } = useUrlNavigation();
  const [activeSection, setActiveSection] = useUrlQueryState<ChatSection>("chatSection", "chats", ["chats", "ai", "colleagues", "requests", "contacts", "settings"], { clear: ["chatId", "chatTab"] });
  const [chatSubTab, setChatSubTab] = useUrlQueryState<"personal" | "service" | "groups">("chatTab", "personal", ["personal", "service", "groups"], { clear: ["chatId"] });
  const selectedChatId = params.get("chatId");
  const selectedAdminChat = selectedChatId === "admin";
  const selectedGeneralChat = selectedChatId === "general";
  const requestedStudentId = selectedChatId && !selectedAdminChat && !selectedGeneralChat ? selectedChatId : null;
  const [searchQuery, setSearchQuery] = useState("");
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [orgStudents, setOrgStudents] = useState<{ user_id: string; full_name: string }[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const { conversations, isLoading } = d.orgChats;
  const organizationId = d.organizationId;
  const currentUserId = d.user?.id;
  const [restoredStudent, setRestoredStudent] = useState<{ user_id: string; full_name: string | null; organization_id: string } | null>(null);
  const knownConversation = conversations.find(conversation => conversation.studentUserId === requestedStudentId);
  const knownStudent = orgStudents.find(student => student.user_id === requestedStudentId);
  const hasKnownStudent = Boolean(knownConversation || knownStudent);
  const restoredMatches = restoredStudent?.user_id === requestedStudentId && restoredStudent?.organization_id === organizationId;
  const selectedStudentId = requestedStudentId && (knownConversation || knownStudent || restoredMatches) ? requestedStudentId : null;
  const selectedStudentName = knownConversation?.studentName || knownStudent?.full_name
    || (restoredMatches ? restoredStudent?.full_name : "") || "Ученик";

  // A reload can restore a conversation before its first message exists. Resolve
  // the name within this organization; a URL alone must not select a foreign user.
  useEffect(() => {
    if (!requestedStudentId || !organizationId || hasKnownStudent) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.from("profiles")
          .select("user_id, full_name, organization_id")
          .eq("organization_id", organizationId).eq("user_id", requestedStudentId).maybeSingle();
        if (!cancelled) setRestoredStudent(!error && data?.organization_id === organizationId && data.user_id === requestedStudentId
          ? { user_id: data.user_id, full_name: data.full_name, organization_id: organizationId } : null);
      } catch {
        if (!cancelled) setRestoredStudent(null);
      }
    })();
    return () => { cancelled = true; };
  }, [requestedStudentId, organizationId, hasKnownStudent]);

  const openChat = (chatId: string | null) => updateParams(current => {
    const next = new URLSearchParams(current);
    if (chatId) {
      next.delete("chatSection");
      if (chatId === "admin" || chatId === "general") next.set("chatTab", "service");
      else next.delete("chatTab");
      next.set("chatId", chatId);
    } else next.delete("chatId");
    return next;
  });

  // Load user profile
  useEffect(() => {
    if (!currentUserId) return;
    supabase.from("profiles").select("full_name, email, avatar_url").eq("user_id", currentUserId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUserName(data.full_name || data.email || "");
          setUserEmail(data.email || "");
          setUserAvatar(data.avatar_url);
        }
      });
  }, [currentUserId]);

  // Load admin unread count
  useEffect(() => {
    if (!organizationId) return;
    const loadAdminUnread = async () => {
      const { count } = await supabase.from("admin_org_messages").select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("sender_role", "admin").eq("is_read", false);
      setAdminUnreadCount(count || 0);
    };
    loadAdminUnread();
    const channel = supabase.channel(`org-admin-unread-${organizationId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_org_messages", filter: `organization_id=eq.${organizationId}` }, () => { loadAdminUnread(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organizationId]);

  const loadOrgStudents = async () => {
    if (!organizationId) return;
    setLoadingStudents(true);
    try {
      const { data } = await supabase.from("profiles").select("user_id, full_name").eq("organization_id", organizationId).not("full_name", "is", null).order("full_name");
      setOrgStudents(data || []);
    } catch (err) { console.error("Failed to load students:", err); }
    finally { setLoadingStudents(false); }
  };

  const existingStudentIds = useMemo(() => new Set(conversations.map(c => c.studentUserId)), [conversations]);

  const filteredNewStudents = useMemo(() => {
    const available = orgStudents.filter(s => s.user_id !== currentUserId);
    if (!newChatSearch) return available;
    return available.filter(s => s.full_name?.toLowerCase().includes(newChatSearch.toLowerCase()));
  }, [orgStudents, newChatSearch, currentUserId]);

  const filtered = searchQuery
    ? conversations.filter((c) => c.studentName.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  const selectedConvo = conversations.find((c) => c.studentUserId === selectedStudentId);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm", { locale: ru });
    if (isYesterday(date)) return "Вчера";
    return format(date, "dd.MM.yy", { locale: ru });
  };

  const handleSelectStudent = (studentId: string, name?: string) => {
    openChat(studentId);
    setTimeout(() => d.orgChats.refresh(), 1500);
  };

  const handleSelectAdminChat = () => openChat("admin");
  const handleSelectGeneralChat = () => openChat("general");
  const handleNewChatWithStudent = (studentId: string, name: string) => { setShowNewChatDialog(false); setNewChatSearch(""); handleSelectStudent(studentId, name); };
  const handleOpenNewChat = () => { setShowNewChatDialog(true); loadOrgStudents(); };

  if (isLoading) return <div className="flex justify-center py-12"><SigmaSpinner /></div>;

  const hasActiveChat = selectedStudentId || selectedAdminChat || selectedGeneralChat;

  function renderStudentChats() {
    // Mobile admin chat
    if (isMobile && selectedAdminChat && organizationId && currentUserId) {
      return (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" onClick={() => openChat(null)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Назад</Button>
          <div className="flex items-center gap-2 px-1">
            <ChatAvatar name="Администрация" size="sm" isAdmin />
            <h3 className="font-semibold text-lg flex-1">Администрация платформы</h3>
            <ChatNotificationToggle chatType="admin" />
          </div>
          <AdminChatDialog organizationId={organizationId} currentUserId={currentUserId} />
        </div>
      );
    }
    // Mobile general chat
    if (isMobile && selectedGeneralChat && organizationId && currentUserId) {
      return (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" onClick={() => openChat(null)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Назад</Button>
          <div className="flex items-center gap-2 px-1">
            <ChatAvatar name="Общий чат" size="sm" />
            <h3 className="font-semibold text-lg flex-1">Общий чат</h3>
            <ChatNotificationToggle chatType="general" />
          </div>
          <OrgGeneralChat organizationId={organizationId} currentUserId={currentUserId} onStartPrivateChat={handleSelectStudent} />
        </div>
      );
    }
    // Mobile student chat
    if (isMobile && selectedStudentId && organizationId && currentUserId) {
      return (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" onClick={() => openChat(null)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Назад</Button>
          <div className="flex items-center gap-2 px-1">
            <ChatAvatar name={selectedConvo?.studentName || selectedStudentName} size="sm" />
            <h3 className="font-semibold text-lg flex-1">{selectedConvo?.studentName || selectedStudentName}</h3>
            <ChatNotificationToggle chatType="student" chatPartnerId={selectedStudentId} />
          </div>
          <ChatTab studentUserId={selectedStudentId} organizationId={organizationId} currentUserId={currentUserId} studentName={selectedConvo?.studentName || selectedStudentName} />
        </div>
      );
    }

    // Groups tab — show tabs + groups panel
    if (chatSubTab === "groups" && organizationId && currentUserId) {
      return (
        <div className="flex gap-4">
          <div className="flex flex-col w-full max-w-md border border-border rounded-xl bg-card overflow-hidden">
            <div className="p-2 border-b border-border">
              <Tabs value={chatSubTab} onValueChange={(v) => setChatSubTab(v as "personal" | "service" | "groups")}>
                <TabsList className="w-full h-8">
                  <TabsTrigger value="personal" className="flex-1 text-xs h-7">Личные</TabsTrigger>
                  <TabsTrigger value="service" className="flex-1 text-xs h-7">Служебные</TabsTrigger>
                  <TabsTrigger value="groups" className="flex-1 text-xs h-7">Группы</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <ChatGroupsPanel organizationId={organizationId} currentUserId={currentUserId} />
          </div>
        </div>
      );
    }

    return (
      <div className={`flex gap-4 ${hasActiveChat ? "h-full" : ""}`}>
        <div className={`flex flex-col ${hasActiveChat && !isMobile ? "w-80 shrink-0" : "flex-1 max-w-md"} border border-border rounded-xl bg-card overflow-hidden`}>
          {/* Sub-tabs */}
          <div className="p-2 border-b border-border">
            <Tabs value={chatSubTab} onValueChange={(v) => setChatSubTab(v as "personal" | "service" | "groups")}>
              <TabsList className="w-full h-8">
                <TabsTrigger value="personal" className="flex-1 text-xs h-7">Личные</TabsTrigger>
                <TabsTrigger value="service" className="flex-1 text-xs h-7">Служебные</TabsTrigger>
                <TabsTrigger value="groups" className="flex-1 text-xs h-7">Группы</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {chatSubTab === "personal" && (
            <>
              <div className="p-3 border-b border-border flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Поиск по имени..." className="pl-9" />
                </div>
                <Button variant="outline" size="icon" onClick={handleOpenNewChat} title="Новый чат"><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 && searchQuery ? (
                  <div className="text-center py-8 text-muted-foreground"><p className="text-sm">Ничего не найдено</p></div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground"><p className="text-sm">Нет переписок</p></div>
                ) : (
                  filtered.map((convo) => (
                    <button key={convo.studentUserId} onClick={() => handleSelectStudent(convo.studentUserId, convo.studentName)}
                      className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${selectedStudentId === convo.studentUserId ? "bg-primary/5" : ""}`}>
                      <div className="flex items-center gap-3">
                        <ChatAvatar name={convo.studentName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <span className={`font-medium text-sm truncate block ${convo.unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>{convo.studentName}</span>
                          <p className={`text-xs truncate mt-0.5 ${convo.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                            {convo.lastSenderIsOrg && <span className="text-muted-foreground">Вы: </span>}
                            {convo.lastMessage || "Вложение"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{formatTime(convo.lastMessageAt)}</span>
                          {convo.unreadCount > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[16px]">{convo.unreadCount}</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {chatSubTab === "service" && (
            <div className="flex-1 overflow-y-auto">
              <button onClick={handleSelectAdminChat}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${selectedAdminChat ? "bg-primary/5" : ""}`}>
                <div className="flex items-center gap-3">
                  <ChatAvatar name="Администрация" size="sm" isAdmin />
                  <div className="min-w-0 flex-1">
                    <span className={`font-medium text-sm truncate block ${adminUnreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>Администрация платформы</span>
                    <p className="text-xs truncate mt-0.5 text-muted-foreground">Чат с поддержкой платформы</p>
                  </div>
                  {adminUnreadCount > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[16px]">{adminUnreadCount}</Badge>
                  )}
                </div>
              </button>
              <button onClick={handleSelectGeneralChat}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${selectedGeneralChat ? "bg-primary/5" : ""}`}>
                <div className="flex items-center gap-3">
                  <ChatAvatar name="Общий чат" size="sm" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-sm truncate block text-muted-foreground">Общий чат</span>
                    <p className="text-xs truncate mt-0.5 text-muted-foreground">Чат для всей организации</p>
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Chat detail - desktop */}
        {!isMobile && hasActiveChat && (
          <div className="flex-1 border border-border rounded-xl bg-card overflow-hidden flex flex-col">
            {selectedAdminChat && organizationId && currentUserId ? (
              <div className="flex flex-col h-full">
                <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                  <ChatAvatar name="Администрация" size="sm" isAdmin />
                  <h3 className="font-semibold flex-1">Администрация платформы</h3>
                  <ChatNotificationToggle chatType="admin" />
                </div>
                <div className="flex-1 p-4 overflow-hidden">
                  <AdminChatDialog organizationId={organizationId} currentUserId={currentUserId} />
                </div>
              </div>
            ) : selectedGeneralChat && organizationId && currentUserId ? (
              <div className="flex flex-col h-full">
                <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                  <ChatAvatar name="Общий чат" size="sm" />
                  <h3 className="font-semibold flex-1">Общий чат</h3>
                  <ChatNotificationToggle chatType="general" />
                </div>
                <div className="flex-1 p-4 overflow-hidden">
                  <OrgGeneralChat organizationId={organizationId} currentUserId={currentUserId} onStartPrivateChat={handleSelectStudent} />
                </div>
              </div>
            ) : selectedStudentId && organizationId && currentUserId ? (
              <div className="flex flex-col h-full">
                <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                  <ChatAvatar name={selectedConvo?.studentName || selectedStudentName} size="sm" />
                  <h3 className="font-semibold flex-1">{selectedConvo?.studentName || selectedStudentName}</h3>
                  <ChatNotificationToggle chatType="student" chatPartnerId={selectedStudentId} />
                </div>
                <div className="flex-1 p-4 overflow-hidden">
                  <ChatTab studentUserId={selectedStudentId} organizationId={organizationId} currentUserId={currentUserId} studentName={selectedConvo?.studentName || selectedStudentName} />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  function renderContent() {
    switch (activeSection) {
      case "chats": return renderStudentChats();
      case "ai": return <div className="border border-border rounded-xl bg-card p-4 h-full"><AiChatPanel /></div>;
      case "colleagues": return <ColleagueChatPanel role="organization" organizationId={organizationId} />;
      case "requests": return <div className="border border-border rounded-xl bg-card overflow-hidden h-full"><ChatRequestsPanel role="organization" organizationId={organizationId} /></div>;
      case "contacts": return <div className="border border-border rounded-xl bg-card overflow-hidden h-full"><ChatContactsPanel role="organization" organizationId={organizationId} onStartChat={handleSelectStudent} /></div>;
      case "settings": return <div className="border border-border rounded-xl bg-card overflow-hidden h-full"><ChatSettingsPanel userName={userName} email={userEmail} avatarUrl={userAvatar} onAvatarUpdated={setUserAvatar} /></div>;
      default: return renderStudentChats();
    }
  }

  // Mobile: horizontal tabs
  if (isMobile) {
    return (
      <>
        <div className="space-y-3">
          <div className="flex gap-1 overflow-x-auto bg-muted/50 p-1 rounded-xl">
            {[
              { id: "chats" as ChatSection, label: "Чаты" },
              { id: "ai" as ChatSection, label: "ИИ" },
              { id: "colleagues" as ChatSection, label: "Коллеги" },
              { id: "requests" as ChatSection, label: "Заявки" },
              { id: "contacts" as ChatSection, label: "Контакты" },
              { id: "settings" as ChatSection, label: "⚙️" },
            ].map(item => (
              <Button key={item.id} variant={activeSection === item.id ? "default" : "ghost"} size="sm"
                onClick={() => setActiveSection(item.id)} className="rounded-lg text-xs shrink-0">
                {item.label}
              </Button>
            ))}
          </div>
          <div className="min-h-[400px]">{renderContent()}</div>
        </div>
        <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> Написать ученику</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={newChatSearch} onChange={(e) => setNewChatSearch(e.target.value)} placeholder="Поиск ученика..." className="pl-9" autoFocus /></div>
              <div className="max-h-72 overflow-y-auto border border-border rounded-lg">
                {loadingStudents ? <div className="flex justify-center py-8"><SigmaSpinner /></div>
                : filteredNewStudents.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">{newChatSearch ? "Ученик не найден" : "Нет учеников"}</div>
                : filteredNewStudents.map(s => (
                  <button key={s.user_id} onClick={() => handleNewChatWithStudent(s.user_id, s.full_name || "Без имени")}
                    className="w-full text-left px-4 py-2.5 hover:bg-secondary/50 transition-colors border-b border-border/30 last:border-0 flex items-center gap-3">
                    <ChatAvatar name={s.full_name || "?"} size="sm" />
                    <span className="text-sm font-medium">{s.full_name || "Без имени"}</span>
                    {existingStudentIds.has(s.user_id) && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">есть переписка</Badge>}
                  </button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-[300px] border border-border rounded-xl overflow-hidden bg-card">
        <ChatSidebar activeSection={activeSection} onSectionChange={setActiveSection} userName={userName} avatarUrl={userAvatar} />
        <div className="flex-1 overflow-hidden p-4">{renderContent()}</div>
      </div>

      <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> Написать ученику</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={newChatSearch} onChange={(e) => setNewChatSearch(e.target.value)} placeholder="Поиск ученика..." className="pl-9" autoFocus /></div>
            <div className="max-h-72 overflow-y-auto border border-border rounded-lg">
              {loadingStudents ? <div className="flex justify-center py-8"><SigmaSpinner /></div>
              : filteredNewStudents.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">{newChatSearch ? "Ученик не найден" : "Нет учеников"}</div>
              : filteredNewStudents.map(s => (
                <button key={s.user_id} onClick={() => handleNewChatWithStudent(s.user_id, s.full_name || "Без имени")}
                  className="w-full text-left px-4 py-2.5 hover:bg-secondary/50 transition-colors border-b border-border/30 last:border-0 flex items-center gap-3">
                  <ChatAvatar name={s.full_name || "?"} size="sm" />
                  <span className="text-sm font-medium">{s.full_name || "Без имени"}</span>
                  {existingStudentIds.has(s.user_id) && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">есть переписка</Badge>}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
