import { useState, useEffect, useMemo } from "react";
import { MessageCircle, Search, ArrowLeft, Bell, Paperclip, Clock, Shield, Plus, UserPlus, X, Bot, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { ChatNotificationToggle } from "@/components/chat/ChatNotificationToggle";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";

type ChatMode = "students" | "ai" | "colleagues";

export function OrgChatsTab() {
  const d = useOrgDashboard();
  const isMobile = useIsMobile();
  const [chatMode, setChatMode] = useState<ChatMode>("students");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string>("");
  const [selectedAdminChat, setSelectedAdminChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [orgStudents, setOrgStudents] = useState<{ user_id: string; full_name: string }[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const { conversations, isLoading } = d.orgChats;
  const organizationId = d.organizationId;
  const currentUserId = d.user?.id;

  // Load admin unread count
  useEffect(() => {
    if (!organizationId) return;
    const loadAdminUnread = async () => {
      const { count } = await supabase
        .from("admin_org_messages")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("sender_role", "admin")
        .eq("is_read", false);
      setAdminUnreadCount(count || 0);
    };
    loadAdminUnread();

    const channel = supabase
      .channel(`org-admin-unread-${organizationId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "admin_org_messages",
        filter: `organization_id=eq.${organizationId}` }, () => { loadAdminUnread(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organizationId]);

  // Load org students for new chat dialog
  const loadOrgStudents = async () => {
    if (!organizationId) return;
    setLoadingStudents(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("organization_id", organizationId)
        .not("full_name", "is", null)
        .order("full_name");
      setOrgStudents(data || []);
    } catch (err) {
      console.error("Failed to load students:", err);
    } finally {
      setLoadingStudents(false);
    }
  };

  // Students not already in conversations
  const existingStudentIds = useMemo(
    () => new Set(conversations.map(c => c.studentUserId)),
    [conversations]
  );

  const filteredNewStudents = useMemo(() => {
    const available = orgStudents.filter(s => s.user_id !== currentUserId);
    if (!newChatSearch) return available;
    return available.filter(s =>
      s.full_name?.toLowerCase().includes(newChatSearch.toLowerCase())
    );
  }, [orgStudents, newChatSearch, currentUserId]);

  const filtered = searchQuery
    ? conversations.filter((c) =>
        c.studentName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const selectedConvo = conversations.find((c) => c.studentUserId === selectedStudentId);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm", { locale: ru });
    if (isYesterday(date)) return "Вчера";
    return format(date, "dd.MM.yy", { locale: ru });
  };

  const handleSelectStudent = (studentId: string, name?: string) => {
    setSelectedAdminChat(false);
    setSelectedStudentId(studentId);
    if (name) setSelectedStudentName(name);
    setTimeout(() => d.orgChats.refresh(), 1500);
  };

  const handleSelectAdminChat = () => {
    setSelectedStudentId(null);
    setSelectedAdminChat(true);
  };

  const handleNewChatWithStudent = (studentId: string, name: string) => {
    setShowNewChatDialog(false);
    setNewChatSearch("");
    handleSelectStudent(studentId, name);
  };

  const handleOpenNewChat = () => {
    setShowNewChatDialog(true);
    loadOrgStudents();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  const hasActiveChat = selectedStudentId || selectedAdminChat;

  // Mobile: show admin chat if selected
  if (isMobile && selectedAdminChat && organizationId && currentUserId) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setSelectedAdminChat(false)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Назад к чатам
        </Button>
        <h3 className="font-semibold text-lg px-1 flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" /> Администрация платформы
        </h3>
        <AdminChatDialog organizationId={organizationId} currentUserId={currentUserId} />
      </div>
    );
  }

  // Mobile: show student detail if selected
  if (isMobile && selectedStudentId && organizationId && currentUserId) {
    return (
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedStudentId(null)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к чатам
        </Button>
        <h3 className="font-semibold text-lg px-1">{selectedConvo?.studentName || selectedStudentName}</h3>
        <ChatTab
          studentUserId={selectedStudentId}
          organizationId={organizationId}
          currentUserId={currentUserId}
          studentName={selectedConvo?.studentName || selectedStudentName}
        />
      </div>
    );
  }

  const modeButtons = (
    <div className="flex gap-1 mb-4 bg-muted/50 p-1 rounded-xl w-fit">
      <Button
        variant={chatMode === "students" ? "default" : "ghost"}
        size="sm"
        onClick={() => setChatMode("students")}
        className="gap-1.5 rounded-lg text-xs"
      >
        <MessageCircle className="w-3.5 h-3.5" /> Чаты
      </Button>
      <Button
        variant={chatMode === "ai" ? "default" : "ghost"}
        size="sm"
        onClick={() => setChatMode("ai")}
        className="gap-1.5 rounded-lg text-xs"
      >
        <Bot className="w-3.5 h-3.5" /> ИИ-помощник
      </Button>
      <Button
        variant={chatMode === "colleagues" ? "default" : "ghost"}
        size="sm"
        onClick={() => setChatMode("colleagues")}
        className="gap-1.5 rounded-lg text-xs"
      >
        <Users className="w-3.5 h-3.5" /> Коллеги
      </Button>
    </div>
  );

  if (chatMode === "ai") {
    return (
      <>
        {modeButtons}
        <div className="border border-border rounded-xl bg-card p-4 h-[calc(100vh-280px)] min-h-[400px]">
          <AiChatPanel />
        </div>
      </>
    );
  }

  if (chatMode === "colleagues") {
    return (
      <>
        {modeButtons}
        <div className="h-[calc(100vh-280px)] min-h-[400px]">
          <ColleagueChatPanel role="organization" organizationId={organizationId} />
        </div>
      </>
    );
  }

  return (
    <>
      {modeButtons}
      <div className={`flex gap-4 ${hasActiveChat ? "h-[calc(100vh-280px)] min-h-[400px]" : ""}`}>
        {/* Conversations list */}
        <div className={`flex flex-col ${hasActiveChat && !isMobile ? "w-80 shrink-0" : "flex-1 max-w-md"} border border-border rounded-xl bg-card overflow-hidden`}>
          <div className="p-3 border-b border-border flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени..."
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleOpenNewChat}
              title="Новый чат"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Admin platform chat — always first */}
            <button
              onClick={handleSelectAdminChat}
              className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                selectedAdminChat ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <ChatAvatar name="Администрация" size="sm" isAdmin />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium text-sm truncate ${adminUnreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                      Администрация платформы
                    </span>
                  </div>
                  <p className="text-xs truncate mt-0.5 text-muted-foreground">
                    Чат с поддержкой платформы
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {adminUnreadCount > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[16px] flex items-center justify-center">
                      {adminUnreadCount}
                    </Badge>
                  )}
                </div>
              </div>
            </button>

            {filtered.length === 0 && searchQuery ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Ничего не найдено</p>
              </div>
            ) : (
              filtered.map((convo) => (
                <button
                  key={convo.studentUserId}
                  onClick={() => handleSelectStudent(convo.studentUserId, convo.studentName)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                    selectedStudentId === convo.studentUserId ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ChatAvatar name={convo.studentName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm truncate ${convo.unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                          {convo.studentName}
                        </span>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${convo.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {convo.lastSenderIsOrg && <span className="text-muted-foreground">Вы: </span>}
                        {convo.lastMessage || "Вложение"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{formatTime(convo.lastMessageAt)}</span>
                      {convo.unreadCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[16px] flex items-center justify-center">
                          {convo.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat detail - desktop only */}
        {!isMobile && hasActiveChat && (
          <div className="flex-1 border border-border rounded-xl bg-card overflow-hidden flex flex-col">
            {selectedAdminChat && organizationId && currentUserId ? (
              <div className="flex flex-col h-full">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <ChatAvatar name="Администрация" size="sm" isAdmin />
                  <h3 className="font-semibold">Администрация платформы</h3>
                </div>
                <div className="flex-1 p-4 overflow-hidden">
                  <AdminChatDialog organizationId={organizationId} currentUserId={currentUserId} />
                </div>
              </div>
            ) : selectedStudentId && organizationId && currentUserId ? (
              <div className="flex flex-col h-full">
                <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                  <ChatAvatar name={selectedConvo?.studentName || selectedStudentName} size="sm" />
                  <h3 className="font-semibold">{selectedConvo?.studentName || selectedStudentName}</h3>
                </div>
                <div className="flex-1 p-4 overflow-hidden">
                  <ChatTab
                    studentUserId={selectedStudentId}
                    organizationId={organizationId}
                    currentUserId={currentUserId}
                    studentName={selectedConvo?.studentName || selectedStudentName}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* New chat dialog */}
      <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Написать ученику
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={newChatSearch}
                onChange={(e) => setNewChatSearch(e.target.value)}
                placeholder="Поиск ученика..."
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-72 overflow-y-auto border border-border rounded-lg">
              {loadingStudents ? (
                <div className="flex justify-center py-8">
                  <SigmaSpinner />
                </div>
              ) : filteredNewStudents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {newChatSearch ? "Ученик не найден" : "Нет учеников в организации"}
                </div>
              ) : (
                filteredNewStudents.map((student) => {
                  const hasExisting = existingStudentIds.has(student.user_id);
                  return (
                    <button
                      key={student.user_id}
                      onClick={() => handleNewChatWithStudent(student.user_id, student.full_name || "Без имени")}
                      className="w-full text-left px-4 py-2.5 hover:bg-secondary/50 transition-colors border-b border-border/30 last:border-0 flex items-center justify-between"
                    >
                      <span className="text-sm font-medium">{student.full_name || "Без имени"}</span>
                      {hasExisting && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          есть переписка
                        </Badge>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
