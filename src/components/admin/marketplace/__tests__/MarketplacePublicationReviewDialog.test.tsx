import { useLayoutEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P, parsedContext, proposalDto, readinessDto } from "@/lib/__tests__/platformCoursePublication.fixtures";
const mock = vi.hoisted(() => ({ hook: vi.fn(), review: vi.fn(), publish: vi.fn(), save: vi.fn(), reload: vi.fn(),
  selectProposal: vi.fn(), loadMore: vi.fn(), info: vi.fn(), success: vi.fn(), sourceFiles: vi.fn() }));
vi.mock("@/hooks/usePlatformPublicationReview", () => ({ usePlatformPublicationReview: mock.hook }));
vi.mock("../SelectedPlatformProposalFiles", () => ({ SelectedPlatformProposalFiles: (props: unknown) => { mock.sourceFiles(props); return null; } }));
vi.mock("sonner", () => ({ toast: { info: mock.info, success: mock.success } }));
import { MarketplacePublicationReviewDialog } from "../MarketplacePublicationReviewDialog";
function mount() { return render(<MemoryRouter><MarketplacePublicationReviewDialog target={{ ...P.target, title: "Synthetic own course" }}
  onOpenChange={vi.fn()} onPublicationConfirmed={vi.fn()} checkStructure={vi.fn().mockResolvedValue([])} /></MemoryRouter>); }
beforeEach(() => {
  vi.clearAllMocks();
  mock.review.mockResolvedValue(null); mock.publish.mockResolvedValue(null); mock.save.mockResolvedValue(null);
  mock.hook.mockReturnValue({ context: parsedContext(), pending: false, error: null, structuralIssues: [], available: true, scopeVersion: 0,
    review: mock.review, publish: mock.publish, saveDossier: mock.save, reload: mock.reload, selectProposal: mock.selectProposal,
    loadMore: mock.loadMore, isCurrentContext: () => true });
});
afterEach(cleanup);
describe("explicit persisted dossier controls", () => {
  it("renders the saved dossier read-only after reload and never preselects approval", async () => {
    mount();
    await waitFor(() => expect(screen.getByLabelText("Назначение").getAttribute("readonly")).not.toBeNull());
    expect(screen.getByLabelText("Назначение")).toHaveProperty("value", "Explicit SYNTHETIC fixture");
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Подтвердить готовность для каталога" })).toBeDisabled();
    expect(mock.review).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled(); expect(mock.publish).not.toHaveBeenCalled();
    expect(mock.sourceFiles).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ actorId: P.actor, marketplaceId: P.target.marketplaceId, courseId: P.target.courseId, proposal: expect.objectContaining({ id: P.proposal, editionSha256: P.sha }) }), enabled: true, isCurrentContext: expect.any(Function) }));
  });
  it("requires explicit notes, finite next review and acknowledgement before accepting", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Основание решения и замечания"), { target: { value: "Explicit synthetic human review" } });
    fireEvent.change(screen.getByLabelText("Следующая проверка"), { target: { value: "2100-01-01T00:00" } });
    expect(screen.getByRole("button", { name: "Подтвердить готовность для каталога" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Подтвердить готовность для каталога" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить готовность для каталога" }));
    await waitFor(() => expect(mock.review).toHaveBeenCalledOnce());
    expect(mock.publish).not.toHaveBeenCalled();
  });
  it("keeps a historical proposal separate from the current bank and disables decisions", () => {
    mock.hook.mockReturnValue({ ...mock.hook(), context: parsedContext({ proposal: proposalDto({ id: P.otherProposal, is_current: false }) }) });
    mount();
    expect(screen.getByText(/Историческое содержимое не восстанавливается из текущего банка/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Подтвердить готовность для каталога" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выпустить проверенную редакцию" })).toBeDisabled();
  });
  it("does not accept or publish unconfirmed files even with a structurally eligible DTO", () => {
    mock.hook.mockReturnValue({ ...mock.hook(), context: parsedContext({ current_file_state: "unconfirmed" }) });
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Не подтверждены неизменные версии файлов");
    expect(screen.getByRole("button", { name: "Выпустить проверенную редакцию" })).toBeDisabled();
    expect(mock.publish).not.toHaveBeenCalled();
  });
  it("does not call a legacy true flag a new reviewed programme", () => {
    mock.hook.mockReturnValue({ ...mock.hook(), context: parsedContext({ proposal: null, readiness: readinessDto({ state: "legacy_unchanged", proposal_id: null, review_id: null, is_validated: true, blockers: ["explicit_template_review_missing"] }) }) });
    mount();
    expect(screen.getByText("Ранее опубликован; новая проверка не оформлена")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Выпустить проверенную редакцию" })).toBeDisabled();
    expect(mock.review).not.toHaveBeenCalled();
  });
  it.each(["actor", "target"] as const)("clears prior notes, date and acknowledgement synchronously before passive effects on %s switch", change => {
    const targetB = { marketplaceId: "70000000-0000-0000-0000-000000000002", courseId: "30000000-0000-0000-0000-000000000002" };
    let captured: { notes: string; nextReview: string; acknowledged: string | null; acceptDisabled: boolean } | null = null;
    function Probe({ phase }: { phase: number }) {
      useLayoutEffect(() => {
        if (!phase) return;
        captured = { notes: (screen.getByLabelText("Основание решения и замечания") as HTMLTextAreaElement).value,
          nextReview: (screen.getByLabelText("Следующая проверка") as HTMLInputElement).value,
          acknowledged: screen.getByRole("checkbox").getAttribute("aria-checked"),
          acceptDisabled: (screen.getByRole("button", { name: "Подтвердить готовность для каталога" }) as HTMLButtonElement).disabled };
      }, [phase]);
      return <MarketplacePublicationReviewDialog target={{ ...(phase && change === "target" ? targetB : P.target), title: phase ? "New scope title" : "Old scope title" }}
        onOpenChange={vi.fn()} onPublicationConfirmed={vi.fn()} checkStructure={vi.fn().mockResolvedValue([])} />;
    }
    const view = render(<MemoryRouter><Probe phase={0} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Основание решения и замечания"), { target: { value: "Private notes for old scope" } });
    fireEvent.change(screen.getByLabelText("Следующая проверка"), { target: { value: "2100-01-01T00:00" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Подтвердить готовность для каталога" })).not.toBeDisabled();
    mock.hook.mockReturnValue({ ...mock.hook(), scopeVersion: 1,
      context: parsedContext({}, change === "target" ? targetB : P.target, change === "actor" ? P.otherActor : P.actor) });
    view.rerender(<MemoryRouter><Probe phase={1} /></MemoryRouter>);
    // Captured in layout, before the old implementation's form-reset effect.
    expect(captured).toEqual({ notes: "", nextReview: "", acknowledged: "false", acceptDisabled: true });
    expect(mock.review).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
  });
  it("does not display an old unsaved passport in the first render of another target with the same edition hash", () => {
    const targetB = { marketplaceId: "70000000-0000-0000-0000-000000000002", courseId: "30000000-0000-0000-0000-000000000002" };
    mock.hook.mockReturnValue({ ...mock.hook(), context: parsedContext({ proposal: null }) });
    let capturedPurpose: string | null = null;
    function Probe({ phase }: { phase: number }) {
      useLayoutEffect(() => { if (phase) capturedPurpose = (screen.getByLabelText("Назначение") as HTMLTextAreaElement).value; }, [phase]);
      return <MarketplacePublicationReviewDialog target={{ ...(phase ? targetB : P.target), title: "Synthetic draft" }}
        onOpenChange={vi.fn()} onPublicationConfirmed={vi.fn()} checkStructure={vi.fn().mockResolvedValue([])} />;
    }
    const view = render(<MemoryRouter><Probe phase={0} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Назначение"), { target: { value: "Private unsaved purpose for A" } });
    mock.hook.mockReturnValue({ ...mock.hook(), scopeVersion: 1, context: parsedContext({ proposal: null }, targetB) });
    view.rerender(<MemoryRouter><Probe phase={1} /></MemoryRouter>);
    expect(capturedPurpose).toBe(""); expect(mock.save).not.toHaveBeenCalled();
  });

  it.each(["edition", "proposal"] as const)("does not revive acknowledgement when the same target cycles A -> B -> A through %s identity", change => {
    const contextA = parsedContext();
    const contextB = parsedContext();
    if (change === "edition") {
      contextB.currentEditionSha256 = P.changedSha;
      contextB.readiness = { ...contextB.readiness, editionSha256: P.changedSha };
      contextB.proposal = { ...contextB.proposal!, editionSha256: P.changedSha };
    } else {
      contextB.proposal = { ...contextB.proposal!, id: P.otherProposal };
      contextB.readiness = { ...contextB.readiness, proposalId: P.otherProposal };
    }
    mock.hook.mockReturnValue({ ...mock.hook(), context: contextA });
    const view = mount();
    fireEvent.change(screen.getByLabelText("Основание решения и замечания"), { target: { value: "Private acknowledgement for initial A" } });
    fireEvent.change(screen.getByLabelText("Следующая проверка"), { target: { value: "2100-01-01T00:00" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Подтвердить готовность для каталога" })).not.toBeDisabled();
    const sameDialog = () => <MemoryRouter><MarketplacePublicationReviewDialog target={{ ...P.target, title: "Synthetic own course" }}
      onOpenChange={vi.fn()} onPublicationConfirmed={vi.fn()} checkStructure={vi.fn().mockResolvedValue([])} /></MemoryRouter>;
    mock.hook.mockReturnValue({ ...mock.hook(), context: contextB }); view.rerender(sameDialog());
    expect(screen.getByLabelText("Основание решения и замечания")).toHaveProperty("value", "");
    mock.hook.mockReturnValue({ ...mock.hook(), context: contextA }); view.rerender(sameDialog());
    expect(screen.getByLabelText("Основание решения и замечания")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Следующая проверка")).toHaveProperty("value", "");
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Подтвердить готовность для каталога" })).toBeDisabled();
    expect(mock.review).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled(); expect(mock.publish).not.toHaveBeenCalled();
  });

});
