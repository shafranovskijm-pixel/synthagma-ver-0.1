import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ChatSidebar, type ChatSection } from "@/components/chat/ChatSidebar";
import { ChatSettingsPanel } from "@/components/chat/ChatSettingsPanel";
import { ChatContactsPanel } from "@/components/chat/ChatContactsPanel";
import { ColleagueChatPanel } from "@/components/chat/ColleagueChatPanel";
import { AiChatPanel } from "@/components/chat/AiChatPanel";
import { StudentOrgChat } from "@/components/student/StudentOrgChat";
import { OrgGeneralChat } from "@/components/chat/OrgGeneralChat";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { MessageCircle, Bot, Users, Contact, Settings, MessagesSquare } from "lucide-react";

interface StudentChatsTabProps {
  organizationId?: string;
  organizationName?: string;
}

const studentSidebarItems = [
  { id: "chats" as ChatSection, label: "Чаты", icon: MessageCircle },
  { id: "general" as ChatSection, label: "Общий чат", icon: MessagesSquare },
  { id: "ai" as ChatSection, label: "ИИ-помощник", icon: Bot },
  { id: "colleagues" as ChatSection, label: "Коллеги", icon: Users },
  { id: "contacts" as ChatSection, label: "Контакты", icon: Contact },
  { id: "settings" as ChatSection, label: "Настройки", icon: Settings },
];

export function StudentChatsTab({ organizationId, organizationName }: StudentChatsTabProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState<ChatSection>("chats");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("full_name, email, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUserName(data.full_name || data.email || "");
          setUserEmail(data.email || "");
          setUserAvatar(data.avatar_url);
        }
      });
  }, [user?.id]);

  function renderContent() {
    switch (activeSection) {
      case "chats":
        return user && organizationId ? (
          <StudentOrgChat
            studentUserId={user.id}
            organizationId={organizationId}
            organizationName={organizationName || "Организация"}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Нет привязки к организации</p>
          </div>
        );
      case "general":
        return user && organizationId ? (
          <div className="border border-border rounded-xl bg-card overflow-hidden h-full p-4">
            <OrgGeneralChat
              organizationId={organizationId}
              currentUserId={user.id}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Нет привязки к организации</p>
          </div>
        );
      case "ai":
        return (
          <div className="border border-border rounded-xl bg-card p-4 h-full">
            <AiChatPanel />
          </div>
        );
      case "colleagues":
        return (
          <ColleagueChatPanel role="student" organizationId={organizationId} />
        );
      case "contacts":
        return (
          <div className="border border-border rounded-xl bg-card overflow-hidden h-full">
            <ChatContactsPanel role="student" organizationId={organizationId} />
          </div>
        );
      case "settings":
        return (
          <div className="border border-border rounded-xl bg-card overflow-hidden h-full">
            <ChatSettingsPanel
              userName={userName}
              email={userEmail}
              avatarUrl={userAvatar}
              onAvatarUpdated={setUserAvatar}
            />
          </div>
        );
      default:
        return null;
    }
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="flex gap-1 overflow-x-auto bg-muted/50 p-1 rounded-xl">
          {studentSidebarItems.map((item) => (
            <Button
              key={item.id}
              variant={activeSection === item.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSection(item.id)}
              className="rounded-lg text-xs shrink-0"
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="min-h-[400px]">{renderContent()}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[300px] border border-border rounded-xl overflow-hidden bg-card">
      <ChatSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        userName={userName}
        avatarUrl={userAvatar}
        items={studentSidebarItems}
      />
      <div className="flex-1 overflow-hidden p-4">{renderContent()}</div>
    </div>
  );
}
