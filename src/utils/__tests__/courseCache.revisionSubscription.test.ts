import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureOfflineActor, captureOfflineAuthRevision, getOfflineScope, isOfflineActorCurrent,
  observeOfflineAccess, rememberOfflineScope, setOfflineAuthActor, subscribeOfflineAuthRevision,
} from "../courseCache";
const actor = "frdo-revision-subscriber-actor";
const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); setOfflineAuthActor(null); });

describe("authoritative offline access revision subscriptions", () => {
  it("notifies only for actual actor or access changes, then stops after unsubscribe", () => {
    setOfflineAuthActor(null);
    const listener = vi.fn(); const stop = subscribeOfflineAuthRevision(listener); stops.push(stop);
    const start = captureOfflineAuthRevision();
    setOfflineAuthActor(actor);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(captureOfflineAuthRevision()).toBe(start + 1);
    setOfflineAuthActor(actor); observeOfflineAccess("another-actor", "ignored");
    expect(listener).toHaveBeenCalledTimes(1);
    observeOfflineAccess(actor, "server-role:admin");
    expect(listener).toHaveBeenCalledTimes(2);
    observeOfflineAccess(actor, "server-role:admin");
    expect(listener).toHaveBeenCalledTimes(2);
    stop(); setOfflineAuthActor(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("invalidates the epoch and validated scope synchronously before notifying readers", () => {
    setOfflineAuthActor(actor);
    const old = captureOfflineActor(actor);
    const scope = rememberOfflineScope({ actorId: actor, organizationId: "org", effectiveUserId: "learner", mode: "learner" }, "course", old);
    expect(scope).not.toBeNull();
    const listener = vi.fn(() => ({
      oldActorCurrent: isOfflineActorCurrent(actor, old),
      cachedScope: getOfflineScope(actor, "learner", "learner", "course"),
      revision: captureOfflineAuthRevision(),
    }));
    stops.push(subscribeOfflineAuthRevision(listener));
    observeOfflineAccess(actor, "changed-access");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.results[0].value).toEqual({ oldActorCurrent: false, cachedScope: null, revision: old! + 1 });
  });

  it("does not let one failing view subscriber interrupt access invalidation or other subscribers", () => {
    setOfflineAuthActor(actor); const old = captureOfflineActor(actor);
    const broken = vi.fn(() => { throw new Error("unmounted view"); });
    const healthy = vi.fn();
    stops.push(subscribeOfflineAuthRevision(broken), subscribeOfflineAuthRevision(healthy));
    expect(() => observeOfflineAccess(actor, "new-access")).not.toThrow();
    expect(isOfflineActorCurrent(actor, old)).toBe(false);
    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });
});
