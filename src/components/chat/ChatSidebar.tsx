import { MessageCircle, Bot, Users, ClipboardList, Contact, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";
import { Badge } from "@/components/ui/badge";

export type ChatSection = "chats" | "ai" | "colleagues" | "requests" | "contacts" | "settings";

interface ChatSidebarItem {
  id: ChatSection;
  label: string;
  icon: React.ElementType;
  badge?: number;
  hidden?: boolean;
}

interface ChatSidebarProps {
  activeSection: ChatSection;
  onSectionChange: (section: ChatSection) => void;
  userName?: string;
  avatarUrl?: string | null;
  items?: ChatSidebarItem[];
  className?: string;
}

const defaultItems: ChatSidebarItem[] = [
  { id: "chats", label: "Чаты", icon: MessageCircle },
  { id: "ai", label: "ИИ-помощник", icon: Bot },
  { id: "colleagues", label: "Коллеги", icon: Users },
  { id: "requests", label: "Заявки", icon: ClipboardList },
  { id: "contacts", label: "Контакты", icon: Contact },
  { id: "settings", label: "Настройки", icon: Settings },
];

export function ChatSidebar({
  activeSection,
  onSectionChange,
  userName = "",
  avatarUrl,
  items = defaultItems,
  className,
}: ChatSidebarProps) {
  const visibleItems = items.filter(i => !i.hidden);

  return (
    <div className={cn("w-56 shrink-0 border-r border-border bg-card flex flex-col", className)}>
      {/* User profile at top */}
      <div className="p-4 border-b border-border">
        <button
          onClick={() => onSectionChange("settings")}
          className="flex items-center gap-3 w-full text-left hover:opacity-80 transition-opacity"
        >
          <ChatAvatar name={userName} avatarUrl={avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{userName || "Профиль"}</p>
            <p className="text-[11px] text-muted-foreground">Настройки</p>
          </div>
        </button>
      </div>

      {/* Menu items */}
      <nav className="flex-1 py-2">
        {visibleItems.map(item => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.badge && item.badge > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[16px] ml-auto">
                  {item.badge}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
