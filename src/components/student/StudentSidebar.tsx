import { BookOpen, Library, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type StudentTab = "catalog" | "library" | "chat";

interface StudentSidebarProps {
  activeTab: StudentTab;
  setActiveTab: (tab: StudentTab) => void;
  branding: { logoUrl: string; showOrgName: boolean; primaryColor?: string } | null;
  orgName: string | null;
  showAiChat: boolean;
  isPreviewMode?: boolean;
  isAdminView?: boolean;
}

const navItems: { id: StudentTab; icon: typeof BookOpen; label: string }[] = [
  { id: "catalog", icon: BookOpen, label: "Каталог" },
  { id: "library", icon: Library, label: "Мои курсы" },
  { id: "chat", icon: MessageCircle, label: "Чат" },
];

export function StudentSidebar({
  activeTab, setActiveTab, branding, orgName, showAiChat,
  isPreviewMode, isAdminView,
}: StudentSidebarProps) {
  const primaryColor = branding?.primaryColor || "174 72% 46%";

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen flex flex-col w-[80px] border-r border-border items-center py-4 shrink-0",
        (isPreviewMode || isAdminView) && "pt-14"
      )}
      style={{ backgroundColor: `hsl(${primaryColor} / 0.06)` }}
    >
      {/* Logo */}
      <div className="mb-6">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-lg" />
        ) : (
          <SigmaLogo size="sm" />
        )}
      </div>

      {/* Navigation buttons — fixed near top, not flex-1 centered */}
      <nav className="flex flex-col gap-2 items-center">
        {navItems.map((item) => {
          if (item.id === "chat" && !showAiChat) return null;
          const isActive = activeTab === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-[60px] rounded-xl flex flex-col items-center justify-center gap-1 py-2.5 transition-all",
                    isActive
                      ? "text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  style={
                    isActive
                      ? { backgroundColor: `hsl(${primaryColor})` }
                      : { backgroundColor: `hsl(${primaryColor} / 0.15)` }
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span className={cn(
                    "text-[10px] font-medium leading-tight",
                    isActive ? "text-primary-foreground" : "text-muted-foreground"
                  )}>
                    {item.label}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
