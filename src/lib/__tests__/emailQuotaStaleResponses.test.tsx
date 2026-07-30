/**
 * Phase 5C.1.c.2 — stale-response guards and quota gate behaviour.
 *
 * These are behavioural tests driven by deferred promises: the response of
 * organization A is resolved AFTER the response of organization B, proving the
 * hooks discard stale results instead of clobbering fresh state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, render, screen, act } from "@testing-library/react";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: () => maybeSingleMock(val),
        }),
      }),
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useEmailWarmup } from "@/hooks/useEmailWarmup";
import { useOrgSmtp } from "@/hooks/useOrgSmtp";
import { computeQuotaGate } from "@/lib/emailQuotaGate";
import { OrgSmtpSettings } from "@/components/organization/sales/OrgSmtpSettings";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const warmupPayload = (limit: number) => ({
  data: {
    configured: true,
    day: 1,
    effective_daily_limit: limit,
    sent_today: 0,
    remaining: limit,
    total_sent: 0,
    started_at: "2026-07-01",
    safe_warmup_enabled: true,
    provider_daily_limit: 50,
  },
  error: null,
});

const smtpRow = (orgId: string, host: string) => ({
  organization_id: orgId,
  host,
  port: 465,
  username: `user@${host}`,
  from_email: `from@${host}`,
  from_name: "Org A",
  encryption: "ssl",
  is_verified: true,
  last_test_at: null,
  last_test_error: null,
  provider_daily_limit: 30,
  safe_warmup_enabled: false,
});

beforeEach(() => {
  rpcMock.mockReset();
  maybeSingleMock.mockReset();
});

describe("5C.1.c.2 — useEmailWarmup stale response guard", () => {
  it("keeps B data when A resolves after B", async () => {
    const dA = deferred<any>();
    const dB = deferred<any>();
    rpcMock.mockImplementationOnce(() => dA.promise).mockImplementationOnce(() => dB.promise);

    const { result, rerender } = renderHook(({ id }) => useEmailWarmup(id), {
      initialProps: { id: ORG_A },
    });
    rerender({ id: ORG_B });

    await act(async () => {
      dB.resolve(warmupPayload(40));
      await dB.promise;
    });
    await waitFor(() => expect(result.current.status?.daily_limit).toBe(40));

    await act(async () => {
      dA.resolve(warmupPayload(10));
      await dA.promise;
    });
    expect(result.current.status?.daily_limit).toBe(40);
    expect(result.current.loading).toBe(false);
  });

  it("stale error of A does not overwrite successful B", async () => {
    const dA = deferred<any>();
    const dB = deferred<any>();
    rpcMock.mockImplementationOnce(() => dA.promise).mockImplementationOnce(() => dB.promise);

    const { result, rerender } = renderHook(({ id }) => useEmailWarmup(id), {
      initialProps: { id: ORG_A },
    });
    rerender({ id: ORG_B });

    await act(async () => {
      dB.resolve(warmupPayload(20));
      await dB.promise;
    });
    await waitFor(() => expect(result.current.status?.daily_limit).toBe(20));

    await act(async () => {
      dA.resolve({ data: null, error: { code: "42501", message: "permission denied" } });
      await dA.promise;
    });
    expect(result.current.errorKind).toBeNull();
    expect(result.current.status?.daily_limit).toBe(20);
  });
});

describe("5C.1.c.2 — useOrgSmtp stale response guard", () => {
  it("keeps B settings when A resolves after B", async () => {
    const dA = deferred<any>();
    const dB = deferred<any>();
    maybeSingleMock
      .mockImplementationOnce(() => dA.promise)
      .mockImplementationOnce(() => dB.promise);

    const { result, rerender } = renderHook(({ id }) => useOrgSmtp(id), {
      initialProps: { id: ORG_A },
    });
    rerender({ id: ORG_B });

    await act(async () => {
      dB.resolve({ data: smtpRow(ORG_B, "smtp.b.ru"), error: null });
      await dB.promise;
    });
    await waitFor(() => expect(result.current.settings?.host).toBe("smtp.b.ru"));

    await act(async () => {
      dA.resolve({ data: smtpRow(ORG_A, "smtp.a.ru"), error: null });
      await dA.promise;
    });
    expect(result.current.settings?.host).toBe("smtp.b.ru");
    expect(result.current.settings?.organization_id).toBe(ORG_B);
    expect(result.current.loadErrorKind).toBeNull();
  });

  it("stale A error does not clear B settings nor set an error", async () => {
    const dA = deferred<any>();
    const dB = deferred<any>();
    maybeSingleMock
      .mockImplementationOnce(() => dA.promise)
      .mockImplementationOnce(() => dB.promise);

    const { result, rerender } = renderHook(({ id }) => useOrgSmtp(id), {
      initialProps: { id: ORG_A },
    });
    rerender({ id: ORG_B });

    await act(async () => {
      dB.resolve({ data: smtpRow(ORG_B, "smtp.b.ru"), error: null });
      await dB.promise;
    });
    await waitFor(() => expect(result.current.settings?.host).toBe("smtp.b.ru"));

    await act(async () => {
      dA.resolve({ data: null, error: { message: "Failed to fetch" } });
      await dA.promise;
    });
    expect(result.current.loadErrorKind).toBeNull();
    expect(result.current.settings?.host).toBe("smtp.b.ru");
  });

  it("discards a row whose organization_id does not match the requested org", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: smtpRow(ORG_A, "smtp.a.ru"), error: null });
    const { result } = renderHook(() => useOrgSmtp(ORG_B));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toBeNull();
  });
});

describe("5C.1.c.2 — OrgSmtpSettings form reset on organization switch", () => {
  it("B with data=null shows no fields from A, and clears password", async () => {
    maybeSingleMock.mockImplementation(async (orgId: string) =>
      orgId === ORG_A ? { data: smtpRow(ORG_A, "smtp.a.ru"), error: null } : { data: null, error: null },
    );

    const { rerender } = render(<OrgSmtpSettings organizationId={ORG_A} />);
    const hostInput = await screen.findByPlaceholderText("smtp.yandex.ru");
    await waitFor(() => expect((hostInput as HTMLInputElement).value).toBe("smtp.a.ru"));

    const passwordInput = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
    act(() => {
      passwordInput.value = "secret";
      passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    rerender(<OrgSmtpSettings organizationId={ORG_B} />);
    await waitFor(() => expect(screen.getByText("SMTP не настроен")).toBeInTheDocument());

    const hostB = screen.getByPlaceholderText("smtp.yandex.ru") as HTMLInputElement;
    const [userB, fromB] = screen.getAllByPlaceholderText("noreply@example.ru") as HTMLInputElement[];
    const passB = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
    expect(hostB.value).toBe("");
    expect(userB.value).toBe("");
    expect(fromB.value).toBe("");
    expect(passB.value).toBe("");

  });
});

describe("5C.1.c.2 — computeQuotaGate", () => {
  const ok = { scope_key: ORG_A, day: 1, daily_limit: 10, sent_today: 0, remaining: 10, total_sent: 0, started_at: "x", configured: true } as any;

  it("org scope without organizationId blocks launch", () => {
    const g = computeQuotaGate({ scope: "org", organizationId: null, status: null, loading: false, errorKind: null });
    expect(g.blocksLaunch).toBe(true);
    expect(g.reason).toMatch(/Организация не выбрана/);
  });

  it("org scope with status=null and no error still blocks launch", () => {
    const g = computeQuotaGate({ scope: "org", organizationId: ORG_A, status: null, loading: false, errorKind: null });
    expect(g.blocksLaunch).toBe(true);
  });

  it("org scope during initial loading blocks launch", () => {
    const g = computeQuotaGate({ scope: "org", organizationId: ORG_A, status: null, loading: true, errorKind: null });
    expect(g.blocksLaunch).toBe(true);
  });

  it("org scope with configured=false blocks launch", () => {
    const g = computeQuotaGate({
      scope: "org", organizationId: ORG_A,
      status: { ...ok, configured: false }, loading: false, errorKind: null,
    });
    expect(g.blocksLaunch).toBe(true);
    expect(g.reason).toMatch(/SMTP этой организации не настроен/);
  });

  it("background refetch error with existing status does NOT block launch", () => {
    const g = computeQuotaGate({ scope: "org", organizationId: ORG_A, status: ok, loading: false, errorKind: "network" });
    expect(g.blocksLaunch).toBe(false);
    expect(g.reason).toBeNull();
  });

  it("platform scope behaviour unchanged: status present → allowed, initial error → blocked", () => {
    expect(computeQuotaGate({ scope: "platform", organizationId: null, status: ok, loading: false, errorKind: "network" }).blocksLaunch).toBe(false);
    expect(computeQuotaGate({ scope: "platform", organizationId: null, status: null, loading: true, errorKind: null }).blocksLaunch).toBe(true);
    expect(computeQuotaGate({ scope: "platform", organizationId: null, status: null, loading: false, errorKind: "network" }).blocksLaunch).toBe(true);
  });
});
