import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { ContractPreviewDialog } from "../ContractPreviewDialog";
import { resolveContractStoragePath, loadContractPdfObjectUrl } from "@/lib/contracts/contractPreview";

const createSpy = vi.fn(() => "blob:mock-url");
const revokeSpy = vi.fn();

beforeEach(() => {
  createSpy.mockClear();
  revokeSpy.mockClear();
  (URL as any).createObjectURL = createSpy;
  (URL as any).revokeObjectURL = revokeSpy;
});
afterEach(() => cleanup());

const individual: any = {
  id: "c1",
  name: "Договор об образовании",
  contract_number: "ДЕМО-02/2026",
  counterparty_type: "individual",
  student_name: "Иванов Иван",
  company_name: null,
  file_path: "org/contract-1.pdf",
  body_html: "<p>hi</p>",
};

const legal: any = {
  ...individual,
  id: "c2",
  counterparty_type: "legal",
  student_name: null,
  company_name: 'ООО "Ромашка"',
  file_path: "org/contract-2.pdf",
};

function clientWith(result: any) {
  return { storage: { from: () => ({ download: vi.fn().mockResolvedValue(result) }) } };
}

describe("resolveContractStoragePath", () => {
  it("возвращает путь как есть", () => {
    expect(resolveContractStoragePath("org/a.pdf")).toBe("org/a.pdf");
  });
  it("вырезает путь из публичного URL", () => {
    expect(
      resolveContractStoragePath("https://x.supabase.co/storage/v1/object/public/billing-documents/org/a.pdf"),
    ).toBe("org/a.pdf");
  });
  it("null при отсутствии файла", () => {
    expect(resolveContractStoragePath(null)).toBeNull();
  });
});

describe("loadContractPdfObjectUrl", () => {
  it("создаёт object URL из скачанного blob", async () => {
    const url = await loadContractPdfObjectUrl(clientWith({ data: new Blob(["x"]), error: null }), "org/a.pdf");
    expect(url).toBe("blob:mock-url");
  });
  it("бросает ошибку при неудаче", async () => {
    await expect(
      loadContractPdfObjectUrl(clientWith({ data: null, error: { message: "denied" } }), "org/a.pdf"),
    ).rejects.toThrow("denied");
  });
  it("бросает ошибку без пути", async () => {
    await expect(loadContractPdfObjectUrl(clientWith({ data: null, error: null }), null)).rejects.toThrow();
  });
});

describe("ContractPreviewDialog", () => {
  it("показывает физлицо и рендерит iframe", async () => {
    render(
      <ContractPreviewDialog
        open
        onOpenChange={() => {}}
        contract={individual}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        client={clientWith({ data: new Blob(["x"]), error: null })}
      />,
    );
    expect(screen.getByText(/ДЕМО-02\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector("iframe")).toBeTruthy());
  });

  it("показывает компанию-контрагента", async () => {
    render(
      <ContractPreviewDialog
        open
        onOpenChange={() => {}}
        contract={legal}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        client={clientWith({ data: new Blob(["x"]), error: null })}
      />,
    );
    expect(screen.getByText('ООО "Ромашка"')).toBeInTheDocument();
  });

  it("показывает загрузку", () => {
    const client = { storage: { from: () => ({ download: () => new Promise(() => {}) }) } };
    render(
      <ContractPreviewDialog
        open
        onOpenChange={() => {}}
        contract={individual}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        client={client}
      />,
    );
    expect(screen.getByText("Загрузка документа…")).toBeInTheDocument();
  });

  it("показывает ошибку загрузки", async () => {
    render(
      <ContractPreviewDialog
        open
        onOpenChange={() => {}}
        contract={individual}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        client={clientWith({ data: null, error: { message: "Ошибка доступа" } })}
      />,
    );
    await waitFor(() => expect(screen.getByText("Ошибка доступа")).toBeInTheDocument());
  });

  it("сообщает о недоступности предпросмотра без PDF и оставляет DOCX", () => {
    render(
      <ContractPreviewDialog
        open
        onOpenChange={() => {}}
        contract={{ ...individual, file_path: null, file_url: null }}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        client={clientWith({ data: null, error: null })}
      />,
    );
    expect(screen.getByText("Предпросмотр недоступен")).toBeInTheDocument();
    expect(screen.getByLabelText("Скачать DOCX")).not.toBeDisabled();
    expect(screen.getByLabelText("Скачать PDF")).toBeDisabled();
  });

  it("закрывается по кнопке и освобождает object URL при анмаунте", async () => {
    const onOpenChange = vi.fn();
    const { unmount } = render(
      <ContractPreviewDialog
        open
        onOpenChange={onOpenChange}
        contract={individual}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        client={clientWith({ data: new Blob(["x"]), error: null })}
      />,
    );
    await waitFor(() => expect(document.querySelector("iframe")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Закрыть предпросмотр"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    unmount();
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("не грузит документ, пока диалог закрыт", () => {
    const download = vi.fn();
    render(
      <ContractPreviewDialog
        open={false}
        onOpenChange={() => {}}
        contract={individual}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        client={{ storage: { from: () => ({ download }) } }}
      />,
    );
    expect(download).not.toHaveBeenCalled();
  });
});
