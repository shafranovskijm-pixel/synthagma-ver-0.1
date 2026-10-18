import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GenerateDocxContractDialog } from "../GenerateDocxContractDialog";

const mocks = vi.hoisted(() => ({ resolveProgram: vi.fn(), reserve: vi.fn(), generate: vi.fn(), onGenerated: vi.fn(), toastError: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../../../../supabase/functions/_shared/program-facts", async original => ({
  ...await original<typeof import("../../../../../supabase/functions/_shared/program-facts")>(), resolveGroupProgramGeneration: mocks.resolveProgram,
}));
vi.mock("@/api/studentGroupMemberships", () => ({ fetchEffectiveGroupProfiles: async () => [] }));
vi.mock("@/lib/contracts/docxContract", async original => ({
  ...await original<typeof import("@/lib/contracts/docxContract")>(),
  fetchDocxTemplates: async () => [{ template_key: "qa-template", name: "QA template", version_label: "qa-v1" }],
  evaluateDocxReadiness: () => [], isDocxDraftReady: () => true, generateDocxContract: mocks.generate,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.reserve,
  from: (table: string) => {
    const result = { data: table === "companies" ? [{ id: "qa-company", name: "QA company" }]
      : table === "student_groups" ? { program_title: "Mutable course v2", program_hours: 999, program_form: "Очная" } : [], error: null };
    const q: any = { select: () => q, eq: () => q, order: async () => result, maybeSingle: async () => result,
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject) };
    return q;
  },
} }));
vi.mock("@/components/ui/select", async () => {
  const { createContext, useContext } = await import("react"); const Selection = createContext<(v: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: any) => <Selection.Provider value={onValueChange}>{children}</Selection.Provider>,
    SelectTrigger: ({ children }: any) => <div>{children}</div>, SelectValue: () => null,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => { const choose = useContext(Selection); return <button type="button" onClick={() => choose(value)}>{children}</button>; },
  };
});
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn(), warning: vi.fn() } }));
const confirmed = { state: "confirmed", reason: null, fields: { program_title: "Approved QA v1", program_hours: 16, program_form: "Очно-заочная" },
  groupFields: {name:"Pinned QA group",start_date:"2026-10-01",end_date:"2026-10-02",training_dates:["2026-10-01"],schedule_text:"Pinned schedule",instructor_name:"Pinned QA teacher"},
  facts: {duration_calendar:"2 days",attestation_form:"test",attestation_criteria:"QA criteria"},
  provenance: { state: "confirmed", version_id: "qa-version" } };
const unconfirmed = { state: "unconfirmed", reason: "no_confirmed_group_binding", fields: null,
  provenance: { state: "unconfirmed" } };
async function submit() {
  render(<GenerateDocxContractDialog open organizationId="qa-org" groupId="qa-group" groupName="QA group"
    students={[{ user_id: "qa-student", full_name: "QA learner" }]} onClose={vi.fn()} onGenerated={mocks.onGenerated} />);
  fireEvent.click(await screen.findByText("QA company"));
  const button = screen.getByRole("button", { name: "Сформировать Word" }); await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
}
describe("DOCX contract exact programme proof before numbering", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.resolveProgram.mockReset().mockResolvedValue(confirmed); mocks.reserve.mockResolvedValue({ data: "QA-001", error: null });
    mocks.generate.mockResolvedValue({ contractId: "qa-contract", keptCurricula: [] }); mocks.onGenerated.mockResolvedValue(true);
  });
  it("keeps the existing numbering for a confirmed group and pins title/form for every learner", async () => {
    await submit(); await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    expect(mocks.reserve).toHaveBeenCalledOnce(); expect(mocks.resolveProgram.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.reserve.mock.invocationCallOrder[0]);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ contractNumber: "QA-001", draft: expect.objectContaining({
      programs: [{ PROG_TITLE: "Approved QA v1", PROG_FORM: "Очно-заочная", PROG_COUNT: "1" }],
      students: [expect.objectContaining({ STUDENT_PROGRAM: "Approved QA v1", STUDENT_DATES:"01.10.2026 — 02.10.2026" })], scalars: expect.objectContaining({ PROG_FORM: "Очно-заочная", SCHEDULE:"Pinned schedule" }),
    }) }));
  });
  it("produces an explicit unnumbered draft without spending a sequence value when proof is missing", async () => {
    mocks.resolveProgram.mockResolvedValue(unconfirmed); await submit(); await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      contractNumber: "Черновик", contractName: expect.stringContaining("Черновик договора"), draft: expect.objectContaining({ scalars: expect.objectContaining({ DOC_NO: "Черновик" }) }),
    }));
    expect(mocks.onGenerated).toHaveBeenCalledWith(expect.objectContaining({ contractNumbers: [""] }));
  });
  it("rechecks immediately before submit and stops before numbering or compilation on an unavailable resolver", async () => {
    mocks.resolveProgram.mockResolvedValueOnce(confirmed).mockRejectedValueOnce(new Error("Programme source unavailable"));
    await submit(); await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Договор не сформирован", expect.objectContaining({ description: "Programme source unavailable" })));
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
});
