import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { platformCoursePublication } from "@/api/platformCoursePublication";
import { PublicationError, PublicationIntents, type PublicationDossier, type PublicationReviewContext,
  type PublicationTarget, type ReviewDecision } from "@/lib/platformCoursePublication";

interface ReviewScope { key: string | null; generation: number }
interface ReviewView { scope: ReviewScope; context: PublicationReviewContext | null; pending: boolean;
  error: PublicationError["code"] | null; structuralIssues: string[] }
function emptyView(scope: ReviewScope): ReviewView { return { scope, context: null, pending: false, error: null, structuralIssues: [] }; }
function matchesScope(value: PublicationReviewContext, scope: ReviewScope) {
  return scope.key === [value.actorId, value.marketplaceId, value.courseId].join("/");
}

export function usePlatformPublicationReview(target: PublicationTarget | null, open: boolean) {
  const auth = useAuth();
  const actorId = !auth.loading && !auth.authError && auth.userRole === "admin" ? auth.user?.id ?? null : null;
  const key = open && target && actorId ? [actorId, target.marketplaceId, target.courseId].join("/") : null;
  const scope = useRef<ReviewScope>({ key, generation: 0 });
  // Bind this render immediately. A -> B -> A is a new scope, even before effects.
  if (scope.current.key !== key) scope.current = { key, generation: scope.current.generation + 1 };
  const renderScope = scope.current;
  const mounted = useRef(false), serial = useRef(0), busy = useRef<ReviewScope | null>(null);
  const intents = useRef({ scope: renderScope, value: new PublicationIntents() });
  if (intents.current.scope !== renderScope) intents.current = { scope: renderScope, value: new PublicationIntents() };
  const lastConfirmed = useRef<{ scope: ReviewScope; value: PublicationReviewContext; serial: number } | null>(null);
  const [view, setView] = useState<ReviewView>(() => emptyView(renderScope));
  const boundView = view.scope === renderScope ? view : null;
  const context = boundView?.context && matchesScope(boundView.context, renderScope) ? boundView.context : null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; serial.current++; }; }, []);

  const run = useCallback(async (action: (isCurrent: () => boolean) => Promise<PublicationReviewContext>,
    expectedScope: ReviewScope, requiredContext?: PublicationReviewContext): Promise<PublicationReviewContext | null> => {
    const captured = scope.current;
    if (!captured.key || captured !== expectedScope || busy.current === captured) return null;
    if (requiredContext && (!matchesScope(requiredContext, captured) || lastConfirmed.current?.scope !== captured
      || lastConfirmed.current.value !== requiredContext)) return null;
    const id = ++serial.current;
    const live = () => mounted.current && scope.current === captured && id === serial.current;
    busy.current = captured;
    setView(previous => ({ ...emptyView(captured), context: previous.scope === captured ? previous.context : null, pending: true }));
    try {
      const saved = await action(live);
      if (!live()) return null;
      if (!matchesScope(saved, captured)) throw new PublicationError("invalid_response");
      lastConfirmed.current = { scope: captured, value: saved, serial: id };
      setView({ ...emptyView(captured), context: saved, pending: true }); return saved;
    } catch (failure) {
      if (live()) {
        const code = failure instanceof PublicationError ? failure.code : "unavailable";
        if (code === "forbidden") lastConfirmed.current = null;
        setView(previous => ({ ...(previous.scope === captured ? previous : emptyView(captured)), error: code,
          ...(code === "forbidden" ? { context: null } : {}) }));
      }
      return null;
    } finally {
      if (live()) { busy.current = null; setView(previous => previous.scope === captured ? { ...previous, pending: false } : previous); }
    }
  }, []);

  useEffect(() => {
    if (scope.current !== renderScope) return;
    if (!key || !target || !actorId) { setView(emptyView(renderScope)); return; }
    void run(() => platformCoursePublication.context({ ...target }, actorId), renderScope);
    return () => {
      // StrictMode replay can cancel this load; an older scope cleanup must not
      // cancel a new-scope task started from its first layout phase.
      if (scope.current === renderScope) { serial.current++; busy.current = null; }
    };
    // Contexts and handlers are synchronously scoped above; this effect only loads.
    // Identity strings are the scope, not an unstable prop object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderScope, run]);

  const reload = () => target && actorId ? run(() => platformCoursePublication.context({ ...target }, actorId), renderScope) : Promise.resolve(null);
  const selectProposal = (proposalId: string) => target && actorId && context ? run(() => platformCoursePublication.context({ ...target }, actorId,
    { proposalId, expectedEdition: context.currentEditionSha256 }), renderScope, context) : Promise.resolve(null);
  const loadMore = () => {
    if (!target || !actorId || !context?.historyNextBeforeSequence) return Promise.resolve(null);
    const previous = context;
    return run(async () => {
      const next = await platformCoursePublication.context({ ...target }, actorId, { proposalId: previous.proposal?.id,
        expectedEdition: previous.currentEditionSha256, beforeSequence: previous.historyNextBeforeSequence ?? undefined });
      if (next.history.length && previous.history.length && BigInt(next.history[0].sequence) >= BigInt(previous.history[previous.history.length - 1].sequence)) throw new PublicationError("invalid_response");
      const combined = [...previous.history, ...next.history];
      if (new Set(combined.map(e => e.id)).size !== combined.length) throw new PublicationError("invalid_response");
      return { ...next, history: combined };
    }, renderScope, previous);
  };
  const saveDossier = (dossier: PublicationDossier) => {
    if (!target || !actorId || !context) return Promise.resolve(null);
    const snapshot = { ...target }, edition = context.currentEditionSha256;
    return run(() => {
      const requestId = intents.current.value.id("submit", { actorId, ...snapshot, edition, dossier });
      return platformCoursePublication.submit(snapshot, actorId, edition, dossier, requestId);
    }, renderScope, context);
  };
  const review = (decision: ReviewDecision, notes: string, nextReviewAt: string | null) => {
    if (!context || !context.proposal || !actorId) return Promise.resolve(null);
    const current = context;
    const proposalId = current.proposal.id;
    return run(() => {
      const requestId = intents.current.value.id("review", { actorId, marketplaceId: current.marketplaceId, courseId: current.courseId,
        proposalId, edition: current.currentEditionSha256, decision, notes, nextReviewAt });
      return platformCoursePublication.review(current, decision, notes, nextReviewAt, requestId);
    }, renderScope, current);
  };
  const publish = (checkStructure: (target: PublicationTarget, expectedEdition: string) => Promise<string[]>) => {
    if (!context || !context.proposal || !actorId) return Promise.resolve(null);
    const current = context;
    const proposalId = current.proposal.id;
    return run(async isCurrent => {
      const issues = await checkStructure({ marketplaceId: current.marketplaceId, courseId: current.courseId }, current.currentEditionSha256);
      if (!isCurrent()) throw new PublicationError("stale");
      if (issues.length) {
        setView(previous => previous.scope === renderScope ? { ...previous, structuralIssues: issues } : previous);
        throw new PublicationError("structural");
      }
      const requestId = intents.current.value.id("publish", { actorId, marketplaceId: current.marketplaceId, courseId: current.courseId,
        proposalId, edition: current.currentEditionSha256, reviewId: current.readiness.reviewId });
      return platformCoursePublication.publish(current, requestId);
    }, renderScope, current);
  };
  const isCurrentContext = (saved: PublicationReviewContext) => mounted.current && scope.current === renderScope
    && matchesScope(saved, renderScope) && lastConfirmed.current?.scope === renderScope && lastConfirmed.current.value === saved
    && lastConfirmed.current.serial === serial.current;
  return { context, pending: boundView?.pending ?? false, error: boundView?.error ?? null,
    structuralIssues: boundView?.structuralIssues ?? [], available: !!key, scopeVersion: renderScope.generation,
    reload, selectProposal, loadMore, saveDossier, review, publish, isCurrentContext };
}
