import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentChatsTab } from "./StudentChatsTab";
const state = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "synthetic-student" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }));
vi.mock("@/components/chat/ChatSidebar", () => ({ ChatSidebar: ({ items, onSectionChange }: any) => <nav>{items.map((item: any) => <button key={item.id} onClick={() => onSectionChange(item.id)}>{item.label}</button>)}</nav> }));
vi.mock("@/components/chat/ChatSettingsPanel", () => ({ ChatSettingsPanel: () => null }));
vi.mock("@/components/chat/ChatContactsPanel", () => ({ ChatContactsPanel: () => null }));
vi.mock("@/components/chat/ColleagueChatPanel", () => ({ ColleagueChatPanel: () => null }));
vi.mock("@/components/chat/AiChatPanel", () => ({ AiChatPanel: () => <div>Active AI panel</div> }));
vi.mock("@/components/student/StudentOrgChat", () => ({ StudentOrgChat: () => <div>Human organization chat</div> }));
vi.mock("@/components/chat/OrgGeneralChat", () => ({ OrgGeneralChat: () => <div>Human general chat</div> }));
beforeEach(() => { state.mobile = false; });
afterEach(cleanup);
describe("student AI visibility", () => {
  it.each([false, true])("keeps human chats with AI disabled (mobile=%s)", mobile => {
    state.mobile = mobile;
    render(<StudentChatsTab organizationId="org" showAiChat={false} />);
    expect(screen.getByText("Human organization chat")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ИИ-помощник" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Общий чат" }));
    expect(screen.getByText("Human general chat")).toBeInTheDocument();
    expect(screen.queryByText("Active AI panel")).not.toBeInTheDocument();
  });
  it("unmounts a previously active AI panel when the setting is disabled", () => {
    const view = render(<StudentChatsTab organizationId="org" showAiChat />);
    fireEvent.click(screen.getByRole("button", { name: "ИИ-помощник" }));
    expect(screen.getByText("Active AI panel")).toBeInTheDocument();
    view.rerender(<StudentChatsTab organizationId="org" showAiChat={false} />);
    expect(screen.queryByText("Active AI panel")).not.toBeInTheDocument();
    expect(screen.getByText("Human organization chat")).toBeInTheDocument();
  });
});
