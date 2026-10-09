import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrganizationCore } from "@/hooks/useOrganizationCore";
import { Capacitor } from "@capacitor/core";
import { getProxyStatus } from "@/utils/proxyFetch";

type Result = { data: any; error: any };
const state = vi.hoisted(() => ({
  branding: {} as Record<string, unknown>,
  reads: vi.fn(),
  update: vi.fn(),
  returnedRow: true,
  updateError: null as any,
  readError: null as any,
  staleReadback: false,
  upload: vi.fn(),
  publicUrl: "https://storage.example.test/org-branding/org-1/cover.png",
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ plan: "start" }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "organizations") throw new Error(`Unexpected table: ${table}`);
      let columns = "";
      let organizationId = "";
      let update: Record<string, any> | undefined;
      const query = {
        select: (value: string) => { columns = value; return query; },
        eq: (_key: string, value: string) => { organizationId = value; return query; },
        update: (value: Record<string, any>) => { update = value; state.update(value); return query; },
        single: async () => {
          state.reads({ organizationId, columns });
          return state.readError && columns === "id, branding"
            ? { data: null, error: state.readError }
            : { data: { id: organizationId, branding: state.staleReadback && state.update.mock.calls.length ? {} : state.branding }, error: null };
        },
        maybeSingle: async () => {
          if (state.updateError) return { data: null, error: state.updateError };
          if (!state.returnedRow) return { data: null, error: null };
          state.branding = update!.branding;
          return { data: { id: organizationId, branding: state.branding }, error: null };
        },
      };
      return query;
    },
    storage: {
      from: () => ({ upload: state.upload, getPublicUrl: () => ({ data: { publicUrl: state.publicUrl } }) }),
    },
  },
}));

import { ProfileBrandingTab } from "@/components/organization/ProfileBrandingTab";

const organizationId = "org-1";
const publicCoverUrl = `https://${getProxyStatus().supabaseHost}/storage/v1/object/public/org-branding/org-1/cover.png`;
const proxyCoverUrl = "https://api.xn--80aaiswd0ak.xn--p1ai/sb-storage/object/public/org-branding/org-1/cover.png";
const core: OrganizationCore = {
  id: organizationId, name: "Учебная организация", description: "Не менять",
  branding: {}, menu_settings: { courses: true }, student_dashboard_settings: { documents: true },
  subscription_plan: "start", custom_enabled_categories: [], frdo_enabled: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["org-core", organizationId], { ...core, branding: { ...state.branding } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(<QueryClientProvider client={client}><MemoryRouter>
    <ProfileBrandingTab organizationId={organizationId} userId="operator-1" />
  </MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить брендирование" })).toBeEnabled());
  return { client, invalidate, ...view };
}

const editName = () => fireEvent.change(screen.getByPlaceholderText("Введите название для отображения..."), { target: { value: "Новый бренд" } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Сохранить брендирование" }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
  state.publicUrl = publicCoverUrl;
  state.branding = { customName: "Прежний бренд", coverUrl: "https://storage.example.test/old.png" };
  state.returnedRow = true;
  state.updateError = null;
  state.readError = null;
  state.staleReadback = false;
  state.upload.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ProfileBrandingTab verified save and organization cache", () => {
  it("merges with the latest branding and immediately updates the existing organization core", async () => {
    const { client, invalidate } = await setup();
    // These document fields were changed elsewhere after this form loaded.
    state.branding = {
      ...state.branding,
      certificateSettings: { prefix: "ПК", signatures: ["director"] },
      contractSettings: { numbering: "year", details: { clause: "Исходный текст" } },
      customDocumentField: "Сохранить как есть",
    };
    editName();
    expect(screen.getByRole("status")).toHaveTextContent("Изменения не сохранены");
    save();
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Брендирование сохранено"));
    const saved = state.update.mock.calls[0][0].branding;
    expect(saved.certificateSettings).toEqual({ prefix: "ПК", signatures: ["director"] });
    expect(saved.contractSettings).toEqual({ numbering: "year", details: { clause: "Исходный текст" } });
    expect(saved.customDocumentField).toBe("Сохранить как есть");
    expect(saved.customName).toBe("Новый бренд");
    expect(state.reads.mock.calls.map(([read]) => read.columns)).toEqual(["branding", "id, branding", "id, branding"]);
    expect(client.getQueryData(["org-core", organizationId])).toEqual({ ...core, branding: saved });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["org-core", organizationId], exact: true });
    expect(screen.getByRole("status")).toHaveTextContent("Все изменения сохранены");
  });

  it("does not claim success or change the cache when the server updates zero rows", async () => {
    state.returnedRow = false;
    const { client, invalidate } = await setup();
    const previous = client.getQueryData(["org-core", organizationId]);
    editName(); save();
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Не удалось подтвердить сохранение. Изменения остаются в форме — повторите попытку."));
    expect(state.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryData(["org-core", organizationId])).toEqual(previous);
    expect(screen.getByRole("status")).toHaveTextContent("Изменения не сохранены");
  });

  it("preserves unsaved edits after a rejected write and permits retry", async () => {
    state.updateError = { message: "RLS denied" };
    const { invalidate } = await setup();
    editName(); save();
    await waitFor(() => expect(state.error).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText("Введите название для отображения...")).toHaveValue("Новый бренд");
    expect(state.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить брендирование" })).toBeEnabled());
    state.updateError = null;
    save();
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect(state.update).toHaveBeenCalledTimes(2);
  });

  it("aborts before writing when current document settings cannot be read", async () => {
    const { invalidate } = await setup();
    state.readError = { message: "database unavailable" };
    editName(); save();
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.update).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not publish unconfirmed settings to the cache when read-back differs", async () => {
    state.staleReadback = true;
    const { client, invalidate } = await setup();
    const previous = client.getQueryData(["org-core", organizationId]);
    editName(); save();
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.success).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryData(["org-core", organizationId])).toEqual(previous);
  });

  it("blocks save during image upload and explains that the resulting preview still needs saving", async () => {
    const upload = deferred<Result>();
    state.upload.mockReturnValue(upload.promise);
    const { container, client, invalidate } = await setup();
    const previous = client.getQueryData(["org-core", organizationId]);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["png"], "cover.png", { type: "image/png" })] } });
    expect(screen.getByRole("button", { name: "Сохранить брендирование" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Изображение загружается");
    save();
    expect(state.update).not.toHaveBeenCalled();
    await act(async () => upload.resolve({ data: null, error: null }));
    expect(screen.getByRole("img", { name: "Обложка" })).toHaveAttribute("src", proxyCoverUrl);
    expect(screen.getByRole("status")).toHaveTextContent("Изменения не сохранены");
    expect(client.getQueryData(["org-core", organizationId])).toEqual(previous);
    expect(invalidate).not.toHaveBeenCalled();
    save();
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect((client.getQueryData(["org-core", organizationId]) as OrganizationCore).branding?.coverUrl).toBe(state.publicUrl);
  });

  it("does not let an old organization's upload clear a new pending upload", async () => {
    state.branding = {};
    const oldUpload = deferred<Result>();
    const newUpload = deferred<Result>();
    state.upload.mockReturnValueOnce(oldUpload.promise).mockReturnValueOnce(newUpload.promise);
    const view = await setup();
    const file = new File(["png"], "cover.png", { type: "image/png" });
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    view.rerender(<QueryClientProvider client={view.client}><MemoryRouter>
      <ProfileBrandingTab organizationId="org-2" userId="operator-1" />
    </MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить брендирование" })).toBeEnabled());
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await act(async () => oldUpload.resolve({ data: null, error: null }));
    expect(screen.getByRole("button", { name: "Сохранить брендирование" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Изображение загружается");
    expect(screen.queryByRole("img", { name: "Обложка" })).not.toBeInTheDocument();
    state.publicUrl = publicCoverUrl.replace('/org-1/', '/org-2/');
    await act(async () => newUpload.resolve({ data: null, error: null }));
    expect(screen.getByRole("button", { name: "Сохранить брендирование" })).toBeEnabled();
    expect(screen.getByRole("img", { name: "Обложка" })).toHaveAttribute("src", proxyCoverUrl.replace('/org-1/', '/org-2/'));
    expect(screen.getByRole("status")).toHaveTextContent("Изменения не сохранены");
  });
});
