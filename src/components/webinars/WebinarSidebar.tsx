import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageSquare, BarChart3, MessagesSquare } from "lucide-react";
import { WebinarQAPanel } from "./WebinarQAPanel";
import { WebinarPollsPanel } from "./WebinarPollsPanel";
import { WebinarChatPanel } from "./WebinarChatPanel";

interface Props {
  webinarId: string;
  isHost: boolean;
  participantIdentity: string;
  participantName: string;
  isGuest?: boolean;
  className?: string;
}

/**
 * Боковая панель: Чат + Q&A + Опросы (без вкладки «Участники» — она только у хоста на /webinar/:id/live).
 */
export const WebinarSidebar = ({
  webinarId,
  isHost,
  participantIdentity,
  participantName,
  isGuest = false,
  className,
}: Props) => {
  return (
    <aside className={className}>
      <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0 h-full">
        <TabsList className="grid grid-cols-3 mx-2 mt-2">
          <TabsTrigger value="chat" className="text-xs gap-1">
            <MessagesSquare className="w-3.5 h-3.5" /> Чат
          </TabsTrigger>
          <TabsTrigger value="qa" className="text-xs gap-1">
            <MessageSquare className="w-3.5 h-3.5" /> Q&A
          </TabsTrigger>
          <TabsTrigger value="polls" className="text-xs gap-1">
            <BarChart3 className="w-3.5 h-3.5" /> Опросы
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex-1 m-0 min-h-0">
          <WebinarChatPanel
            webinarId={webinarId}
            isHost={isHost}
            participantIdentity={participantIdentity}
            participantName={participantName}
            isGuest={isGuest}
          />
        </TabsContent>
        <TabsContent value="qa" className="flex-1 m-0 min-h-0">
          <WebinarQAPanel
            webinarId={webinarId}
            isHost={isHost}
            participantIdentity={participantIdentity}
            participantName={participantName}
            isGuest={isGuest}
          />
        </TabsContent>
        <TabsContent value="polls" className="flex-1 m-0 min-h-0">
          <WebinarPollsPanel
            webinarId={webinarId}
            isHost={isHost}
            participantIdentity={participantIdentity}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
};
