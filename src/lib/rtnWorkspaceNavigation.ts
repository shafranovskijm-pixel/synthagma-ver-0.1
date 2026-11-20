/** Routing is presentation only: every bank/event still needs a server-authorized lookup. */
export const RTN_WORKSPACE_VIEWS = ['training', 'changes', 'sources'] as const;
export type RtnWorkspaceView = typeof RTN_WORKSPACE_VIEWS[number];

export interface RtnWorkspaceNavigation {
  workspace: 'mine' | 'rtn';
  view: RtnWorkspaceView;
  bankId: string | null;
  eventId: string | null;
  invalidTarget: boolean;
}

export interface RtnWorkspaceNavigationTarget {
  workspace: 'mine' | 'rtn';
  view?: RtnWorkspaceView;
  bankId?: string | null;
  eventId?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNED_KEYS = ['courseWorkspace', 'rtnView', 'rtnBankId', 'rtnEventId'] as const;
const REGISTRATION_KEYS = new Set<string>(['tab', ...OWNED_KEYS]);
const empty = (workspace: 'mine' | 'rtn' = 'mine', invalidTarget = false): RtnWorkspaceNavigation => ({
  workspace, view: 'training', bankId: null, eventId: null, invalidTarget,
});

function isView(value: string): value is RtnWorkspaceView {
  return RTN_WORKSPACE_VIEWS.some(view => view === value);
}

function optionalUuid(params: URLSearchParams, name: string): { valid: boolean; value: string | null } {
  if (!params.has(name)) return { valid: true, value: null };
  const values = params.getAll(name);
  return values.length === 1 && UUID.test(values[0])
    ? { valid: true, value: values[0].toLowerCase() }
    : { valid: false, value: null };
}

/** Unknown/duplicate RTN selectors never resolve to a previously selected subject. */
export function parseRtnWorkspaceNavigation(params: URLSearchParams): RtnWorkspaceNavigation {
  const hasRtnKeys = OWNED_KEYS.some(key => params.has(key))
    || [...params.keys()].some(key => key.startsWith('rtn'));
  if (!hasRtnKeys) return empty();

  if (params.getAll('tab').length !== 1 || params.get('tab') !== 'courses'
    || params.getAll('courseWorkspace').length !== 1) return empty('mine', true);

  const workspace = params.get('courseWorkspace');
  if (workspace === 'mine') {
    return empty('mine', params.has('rtnView') || params.has('rtnBankId') || params.has('rtnEventId')
      || [...params.keys()].some(key => key.startsWith('rtn')));
  }
  if (workspace !== 'rtn') return empty('mine', true);

  if ([...params.keys()].some(key => key.startsWith('rtn') && !REGISTRATION_KEYS.has(key))) {
    return empty('rtn', true);
  }
  const views = params.getAll('rtnView');
  const view = views.length === 0 ? 'training' : views[0];
  const bank = optionalUuid(params, 'rtnBankId');
  const event = optionalUuid(params, 'rtnEventId');
  if (views.length > 1 || !isView(view) || !bank.valid || !event.valid
    || (event.value !== null && view !== 'changes')) return empty('rtn', true);
  return { workspace: 'rtn', view, bankId: bank.value, eventId: event.value, invalidTarget: false };
}

/**
 * Full RTN target, not a patch: omitted detail IDs are cleared when changing views.
 * Non-RTN display/search parameters survive. No organization/actor selector is introduced.
 */
export function withRtnWorkspaceNavigation(
  current: URLSearchParams,
  target: RtnWorkspaceNavigationTarget,
): URLSearchParams {
  if (target.workspace !== 'mine' && target.workspace !== 'rtn') throw new TypeError('Invalid course workspace');
  const view = target.view ?? 'training';
  if (!isView(view)) throw new TypeError('Invalid RTN view');
  for (const value of [target.bankId, target.eventId]) {
    if (value != null && !UUID.test(value)) throw new TypeError('Invalid RTN subject');
  }
  if (target.eventId != null && view !== 'changes') throw new TypeError('RTN events belong to changes');
  if (target.workspace === 'mine' && (target.bankId != null || target.eventId != null)) {
    throw new TypeError('RTN subjects require the RTN workspace');
  }
  const next = new URLSearchParams(current);
  OWNED_KEYS.forEach(key => next.delete(key));
  // Invalid stale names in our namespace should not remain in a newly generated target.
  [...next.keys()].filter(key => key.startsWith('rtn')).forEach(key => next.delete(key));
  next.set('tab', 'courses');
  if (target.workspace === 'rtn') {
    next.set('courseWorkspace', 'rtn');
    next.set('rtnView', view);
    if (target.bankId != null) next.set('rtnBankId', target.bankId.toLowerCase());
    if (target.eventId != null) next.set('rtnEventId', target.eventId.toLowerCase());
  }
  return next;
}

export function rtnWorkspaceHref(
  target: Omit<RtnWorkspaceNavigationTarget, 'workspace'> = {},
): string {
  return '/organization?' + withRtnWorkspaceNavigation(new URLSearchParams(), { ...target, workspace: 'rtn' });
}

/** The only RTN presentation intent permitted through organization registration. */
export function rtnWorkspaceRegistrationTarget(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
    const base = 'https://internal.invalid';
    const url = new URL(raw, base);
    if (url.origin !== base || url.pathname !== '/organization' || url.hash
      || [...url.searchParams.keys()].some(key => !REGISTRATION_KEYS.has(key))) return null;
    const state = parseRtnWorkspaceNavigation(url.searchParams);
    if (state.workspace !== 'rtn' || state.invalidTarget) return null;
    return rtnWorkspaceHref({ view: state.view, bankId: state.bankId, eventId: state.eventId });
  } catch { return null; }
}
