import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePublicationContext, PLATFORM_REVIEW_ORG_ID, type PublicationDossier, type PublicationReviewContext } from "@/lib/platformCoursePublication";
import { P, contextDto, dossier, proposalDto, readinessDto, sourceDto } from "@/lib/__tests__/platformCoursePublication.fixtures";
const mock = vi.hoisted(() => ({ hook: vi.fn(), save: vi.fn(), select: vi.fn(), review: vi.fn(), publish: vi.fn(), info: vi.fn() }));
vi.mock("@/hooks/usePlatformPublicationReview", () => ({ usePlatformPublicationReview: mock.hook }));
vi.mock("../SelectedPlatformProposalFiles", () => ({ SelectedPlatformProposalFiles: () => null }));
vi.mock("../CurrentPlatformFilesCapture", () => ({ CurrentPlatformFilesCapture: () => null }));
vi.mock("sonner", () => ({ toast: { info: mock.info, success: vi.fn() } }));
import { MarketplacePublicationReviewDialog } from "../MarketplacePublicationReviewDialog";
const REF = "61000000-0000-0000-0000-000000000001", CAPTURE = "62000000-0000-0000-0000-000000000001";
function evidence() {
  return { reference: "Synthetic annotation", edition: "Synthetic reviewed edition", checked_at: P.at,
    reference_kind: "course_document", reference_id: REF, file_receipt_id: P.receipt, captured_edition_id: CAPTURE,
    file_bytes_sha256: "c".repeat(64), source_org_version_id: null };
}
function context(savedDossier: unknown = dossier(), sealed = false): PublicationReviewContext {
  const source = sourceDto(P.target, { file_bindings: [{ reference_kind: "course_document", reference_id: REF, state: "unconfirmed",
    receipt_id: null, exact_version_kind: null, exact_version_id: null, file_bytes_sha256: null, byte_length: null }] });
  return parsePublicationContext(contextDto({ current_source_context: source, proposal: proposalDto({ dossier: savedDossier, source_context: source }),
    current_file_state: sealed ? "sealed_current" : "unconfirmed", current_file_context: sealed ? {
      schema_version: 1, actor_id: P.actor, organization_id: PLATFORM_REVIEW_ORG_ID,
      marketplace_id: P.target.marketplaceId, course_id: P.target.courseId, proposal_id: P.proposal,
      proposal_edition_sha256: P.sha, current_edition_sha256: P.sha, scope_generation: "63000000-0000-0000-0000-000000000001",
      state: "sealed_current", reference_count: 1, references: [{ reference_kind: "course_document", reference_id: REF,
        state: "bytes_sealed", receipt: { receipt_id: P.receipt, captured_edition_id: CAPTURE,
          source_org_version_id: null, file_bytes_sha256: "c".repeat(64), byte_length: 43 } }] } : null,
    readiness: readinessDto({ state: "review_incomplete", blockers: ["file_delivery_consumers_not_accepted"] }),
  }), P.target, P.actor);
}
function port(value = context(), generation = 0) {
  return { context: value, pending: false, error: null, structuralIssues: [], available: true, scopeVersion: generation,
    saveDossier: mock.save, selectProposal: mock.select, review: mock.review, publish: mock.publish,
    reload: vi.fn(), loadMore: vi.fn(), isCurrentContext: () => true };
}
function dialog() { return <MemoryRouter><MarketplacePublicationReviewDialog target={{ ...P.target, title: "Synthetic file dossier" }}
  onOpenChange={vi.fn()} onPublicationConfirmed={vi.fn()} checkStructure={vi.fn().mockResolvedValue([])} /></MemoryRouter>; }
function prepare() { fireEvent.click(screen.getByRole("button", { name: "Подготовить новую редакцию досье" })); }
function bind() { fireEvent.click(screen.getByRole("button", { name: new RegExp("Привязать сохранённую версию: документ курса") })); }
function save() { fireEvent.click(screen.getByRole("button", { name: "Сохранить редакцию досье" })); }
beforeEach(() => { vi.clearAllMocks(); mock.save.mockResolvedValue(null); mock.hook.mockReturnValue(port()); });
afterEach(cleanup);

describe("ordinary dossier editor preserves exact file evidence", () => {
  it("renders a saved nine-field binding read-only without any automatic request or acknowledgement", () => {
    const base = dossier(); const fileDossier = { ...base, document_links: { ...base.document_links, evidence: [evidence()] } };
    mock.hook.mockReturnValue(port(context(fileDossier))); render(dialog());
    expect(screen.getByLabelText("Документы и связи — источник 1")).toHaveAttribute("readonly");
    expect(screen.getByText(/Подтверждение файла:/)).toHaveTextContent(P.receipt);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    expect(mock.select).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
    expect(mock.review).not.toHaveBeenCalled(); expect(mock.publish).not.toHaveBeenCalled();
  });
  it("retains all six binding fields across cloning, two consecutive text edits and ordinary save", () => {
    const base = dossier(); const fileDossier = { ...base, document_links: { ...base.document_links, evidence: [evidence()] } };
    const original = JSON.stringify(fileDossier); mock.hook.mockReturnValue(port(context(fileDossier)));
    render(dialog()); prepare();
    fireEvent.change(screen.getByLabelText("Документы и связи — источник 1"), { target: { value: "Author edit one" } });
    fireEvent.change(screen.getByLabelText("Документы и связи — редакция 1"), { target: { value: "Author edit two" } });
    save(); const saved = mock.save.mock.calls[0][0] as PublicationDossier;
    expect(saved.document_links.evidence).toEqual([{ ...evidence(), reference: "Author edit one", edition: "Author edit two" }]);
    expect(JSON.stringify(fileDossier)).toBe(original); expect(mock.select).not.toHaveBeenCalled();
  });
  it("requires the fresh exact selected-proposal read before inserting a blank author annotation", async () => {
    const fresh = context(dossier(), true);
    mock.select.mockImplementation(async () => { mock.hook.mockReturnValue(port(fresh)); return fresh; });
    render(dialog()); prepare(); expect(screen.queryByLabelText("Документы и связи — источник 1")).toBeNull(); bind();
    await waitFor(() => expect(screen.getByLabelText("Документы и связи — источник 1")).toHaveValue(""));
    expect(mock.select).toHaveBeenCalledExactlyOnceWith(P.proposal);
    expect(screen.getByLabelText("Документы и связи — редакция 1")).toHaveValue("");
    expect(screen.getByLabelText("Документы и связи — проверено 1")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Документы и связи — источник 1"), { target: { value: "Author inspected file" } });
    save(); const saved = mock.save.mock.calls[0][0] as PublicationDossier;
    expect(saved.document_links.evidence).toEqual([{ ...evidence(), reference: "Author inspected file", edition: "", checked_at: "" }]);
    expect(saved.document_links.state).toBe(dossier().document_links.state);
    expect(mock.review).not.toHaveBeenCalled(); expect(mock.publish).not.toHaveBeenCalled();
  });
  it("updates only the exact existing pair without duplicating it or erasing its annotation", async () => {
    const base = dossier(); const priorRef = { ...evidence(), file_receipt_id: P.otherRequest };
    const prior = { ...base, document_links: { ...base.document_links, evidence: [priorRef] } };
    const fresh = context(prior, true); mock.hook.mockReturnValue(port(context(prior)));
    mock.select.mockImplementation(async () => { mock.hook.mockReturnValue(port(fresh)); return fresh; });
    render(dialog()); prepare(); bind(); await waitFor(() => expect(screen.getByText(/Подтверждение файла:/)).toHaveTextContent(P.receipt)); save();
    expect((mock.save.mock.calls[0][0] as PublicationDossier).document_links.evidence).toEqual([evidence()]);
  });
  it.each(["actor", "target", "generation"])("rejects an in-flight old proof after %s scope changes", async change => {
    let resolve!: (value: PublicationReviewContext) => void;
    mock.select.mockReturnValue(new Promise<PublicationReviewContext>(done => { resolve = done; }));
    const view = render(dialog()); prepare(); bind();
    const changed = context();
    if (change === "actor") changed.actorId = P.otherActor;
    if (change === "target") changed.courseId = P.target.marketplaceId;
    mock.hook.mockReturnValue(port(changed, change === "generation" ? 1 : 0)); view.rerender(dialog());
    await act(async () => { resolve(context(dossier(), true)); }); expect(mock.select).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Документы и связи — источник 1")).toBeNull(); expect(mock.save).not.toHaveBeenCalled();
  });
  it("does not infer a current binding when the fresh read contains no authoritative proof", async () => {
    mock.select.mockResolvedValue(context()); render(dialog()); prepare(); bind();
    await waitFor(() => expect(mock.info).toHaveBeenCalledWith("Сохранённая версия этого файла пока не подтверждена для выбранной редакции."));
    expect(screen.queryByLabelText("Документы и связи — источник 1")).toBeNull(); expect(mock.save).not.toHaveBeenCalled();
  });
  it("keeps unknown saved evidence read-only until explicit creation of an empty new dossier", () => {
    const raw = { ...dossier(), document_links: { ...dossier().document_links, evidence: [{ ...evidence(), unknown: "retain" }] } };
    const before = JSON.stringify(raw); mock.hook.mockReturnValue(port(context(raw))); render(dialog());
    expect(screen.getByText(/Формат сохранённого досье не поддерживается целиком/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Назначение")).toBeNull(); expect(mock.save).not.toHaveBeenCalled();
    prepare(); expect(screen.getByLabelText("Назначение")).toHaveValue(""); expect(JSON.stringify(raw)).toBe(before);
  });
  it("does not offer current binding insertion for a selected historical proposal", () => {
    const prior = context(); prior.proposal = { ...prior.proposal!, isCurrent: false };
    mock.hook.mockReturnValue(port(prior)); render(dialog()); prepare();
    expect(screen.queryByRole("button", { name: /Привязать сохранённую версию/ })).toBeNull();
    expect(mock.select).not.toHaveBeenCalled();
  });
});
