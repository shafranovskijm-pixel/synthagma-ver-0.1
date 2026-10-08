import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const testState = vi.hoisted(() => ({
  single: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/hooks/useSubscriptionLimits", () => ({
  useSubscriptionLimits: () => ({ plan: "start" }),
}));

vi.mock("sonner", () => ({
  toast: { error: testState.toastError, success: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: testState.single }) }),
    }),
    storage: { from: testState.storageFrom },
  },
}));

import { ProfileBrandingTab } from "@/components/organization/ProfileBrandingTab";

const ORGANIZATION_ID = "ba57e10a-3f87-4f81-82b5-ff4958367840";
const USER_ID = "f4a507bf-7269-4d7f-8bb0-5d0bfc2376d7";
const PUBLIC_BASE = "https://storage.example.test/storage/v1/object/public/org-branding/";

async function renderBranding() {
  const result = render(
    <MemoryRouter>
      <ProfileBrandingTab organizationId={ORGANIZATION_ID} userId={USER_ID} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(testState.single).toHaveBeenCalledOnce());
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.single.mockResolvedValue({ data: { branding: {} }, error: null });
  testState.upload.mockResolvedValue({ error: null });
  testState.getPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: PUBLIC_BASE + path },
  }));
  // The installation has org-branding; using an invented bucket reproduces
  // the production error instead of silently making every mocked bucket work.
  testState.storageFrom.mockImplementation((bucket: string) => ({
    upload: bucket === "org-branding"
      ? testState.upload
      : async () => ({ error: { message: "Bucket not found" } }),
    getPublicUrl: testState.getPublicUrl,
  }));
});

afterEach(cleanup);

describe("ProfileBrandingTab image uploads", () => {
  it.each([
    { kind: "cover", inputIndex: 0, alt: "Обложка" },
    { kind: "logo", inputIndex: 1, alt: "Логотип" },
  ])("uploads $kind to the existing bucket under the organization and shows it", async ({ kind, inputIndex, alt }) => {
    const { container } = await renderBranding();
    const file = new File(["png-image"], "brand.png", { type: "image/png" });
    const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[inputIndex];

    fireEvent.change(input, { target: { files: [file] } });

    const image = await screen.findByRole("img", { name: alt });
    expect(testState.storageFrom.mock.calls.map(([bucket]) => bucket)).toEqual(["org-branding", "org-branding"]);
    expect(testState.upload).toHaveBeenCalledOnce();
    const [path, uploadedFile, options] = testState.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${ORGANIZATION_ID}/${kind}_\\d+\\.png$`));
    expect(path).not.toContain(USER_ID);
    expect(uploadedFile).toBe(file);
    expect(options).toEqual({ upsert: true });
    expect(testState.getPublicUrl).toHaveBeenCalledWith(path);
    expect(image.getAttribute("src")).toBe(PUBLIC_BASE + path);
    expect(testState.toastError).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it.each([
    { inputIndex: 0, alt: "Обложка" },
    { inputIndex: 1, alt: "Логотип" },
  ])("reports the storage failure for $alt without displaying a broken image", async ({ inputIndex, alt }) => {
    testState.upload.mockResolvedValueOnce({ error: { message: "new row violates row-level security policy" } });
    const { container } = await renderBranding();
    const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[inputIndex];

    fireEvent.change(input, {
      target: { files: [new File(["png-image"], "brand.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(testState.toastError).toHaveBeenCalledWith(
      "Ошибка загрузки: new row violates row-level security policy",
    ));
    expect(testState.getPublicUrl).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: alt })).toBeNull();
    expect(input.value).toBe("");
  });

  it("allows retrying the same cover file after a server failure", async () => {
    testState.upload.mockResolvedValueOnce({ error: { message: "Storage temporarily unavailable" } });
    const { container } = await renderBranding();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["png-image"], "brand.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(testState.toastError).toHaveBeenCalledWith(
      "Ошибка загрузки: Storage temporarily unavailable",
    ));
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole("img", { name: "Обложка" });
    expect(testState.upload).toHaveBeenCalledTimes(2);
    expect(testState.getPublicUrl).toHaveBeenCalledOnce();
  });
});
