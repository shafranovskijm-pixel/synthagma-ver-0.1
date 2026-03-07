import { useState } from "react";
import { MessageCircle, Search, ArrowLeft, Loader2, Bell, Paperclip, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChatTab } from "@/components/organization/student-detail/ChatTab";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";

const chatFeatures = [
  {
    icon: Bell,
    title: "Мгновенные уведомления",
    description: "Realtime-обновления и счётчик непрочитанных сообщений — вы не пропустите ни одного обращения",
  },
  {
    icon: Paperclip,
    title: "Обмен файлами",
    description: "Отправляйте и получайте вложения: документы, изображения, справки и любые файлы",
  },
  {
    icon: Clock,
    title: "История переписки",
    description: "Полный архив всех диалогов с поиском — найдите нужное сообщение за секунды",
  },
];

export function OrgChatsTab() {
  const d = useOrgDashboard();
  const isMobile = useIsMobile();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { conversations, isLoading } = d.orgChats;
  const organizationId = d.organizationId;
  const currentUserId = d.user?.id;

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

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    // Refresh unread counts after opening a chat (messages get marked as read)
    setTimeout(() => d.orgChats.refresh(), 1500);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Empty state — feature showcase
  if (conversations.length === 0 && !searchQuery) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-2">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <MessageCircle className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Чат с учениками</h2>
          <p className="text-muted-foreground text-base max-w-md mx-auto">
            Общайтесь напрямую с учениками — отвечайте на вопросы, отправляйте файлы и следите за обращениями в одном месте
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          {chatFeatures.map((f) => (
            <Card key={f.title} className="border-border/60 bg-card/80">
              <CardContent className="pt-6 pb-5 px-5 flex flex-col items-center text-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Чаты появятся автоматически, когда ученики напишут вам
          <br className="hidden sm:block" />
          {" "}или вы начнёте диалог из карточки ученика
        </p>
      </div>
    );
  }

  // Mobile: show detail if selected
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
        <h3 className="font-semibold text-lg px-1">{selectedConvo?.studentName}</h3>
        <ChatTab
          studentUserId={selectedStudentId}
          organizationId={organizationId}
          currentUserId={currentUserId}
          studentName={selectedConvo?.studentName || ""}
        />
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[400px]">
      {/* Conversations list */}
      <div className={`flex flex-col ${selectedStudentId && !isMobile ? "w-80 shrink-0" : "flex-1"} border border-border rounded-xl bg-card overflow-hidden`}>
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по имени..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                {searchQuery ? "Ничего не найдено" : "Нет сообщений от учеников"}
              </p>
            </div>
          ) : (
            filtered.map((convo) => (
              <button
                key={convo.studentUserId}
                onClick={() => handleSelectStudent(convo.studentUserId)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                  selectedStudentId === convo.studentUserId ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
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
      {!isMobile && (
        <div className="flex-1 border border-border rounded-xl bg-card overflow-hidden flex flex-col">
          {selectedStudentId && organizationId && currentUserId ? (
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold">{selectedConvo?.studentName}</h3>
              </div>
              <div className="flex-1 p-4 overflow-hidden">
                <ChatTab
                  studentUserId={selectedStudentId}
                  organizationId={organizationId}
                  currentUserId={currentUserId}
                  studentName={selectedConvo?.studentName || ""}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/50 mb-4">
                  <MessageCircle className="w-7 h-7 opacity-40" />
                </div>
                <p className="text-sm font-medium mb-1">Выберите чат</p>
                <p className="text-xs text-muted-foreground/70">Нажмите на диалог слева, чтобы открыть переписку</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
