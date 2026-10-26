export const ids = {
  actor: '10000000-0000-4000-8000-000000000001', other: '10000000-0000-4000-8000-000000000002',
  order: '20000000-0000-4000-8000-000000000001', listing: '30000000-0000-4000-8000-000000000001',
  buyer: '40000000-0000-4000-8000-000000000001', seller: '40000000-0000-4000-8000-000000000002',
  source: '50000000-0000-4000-8000-000000000001', delivered: '50000000-0000-4000-8000-000000000002',
  platform: '4ac2c05a-d8b5-4e72-ba31-f2c743091d95',
};
export let handler: (request: Request) => Promise<Response>;
export function captureHandler(value: typeof handler) { handler = value; }
export const state: any = {};
export function reset() {
  Object.assign(state, {
    actor: ids.actor, revoked: false, blocked: false, permission: true,
    order: { id: ids.order, marketplace_course_id: ids.listing, buyer_user_id: ids.actor, buyer_organization_id: ids.buyer,
      buyer_type: 'organization', status: 'paid', paid_at: '2026-10-26T09:00:00Z', price: 0, students_count: 1, notes: null },
    delivered: { id: ids.delivered, organization_id: ids.buyer, source_order_id: ids.order, source_course_id: ids.source },
    listing: { id: ids.listing, course_id: ids.source, organization_id: null },
    source: { id: ids.source, title: 'Курс <безопасность>', organization_id: ids.platform },
    buyerName: 'Покупатель <центр>', sellerName: 'Продавец <центр>', profiles: [], profilesError: null, sellerError: null,
    env: { SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'local-service-placeholder',
      SUPABASE_ANON_KEY: 'local-anon-placeholder', TELEGRAM_BOT_TOKEN: 'local-bot-placeholder', TELEGRAM_SUPPORT_CHAT_ID: 'local-chat' },
    traces: [], smtp: [], telegram: [], claims: new Set<string>(),
    smtpThrows: false, smtpOk: true, telegramThrows: false, telegramOk: true,
  });
}
function query(role: 'admin' | 'caller', table: string) {
  const filters: Record<string, unknown> = {};
  const q: any = {
    select(columns: string) { state.traces.push(['select', role, table, columns]); return q; },
    eq(column: string, value: unknown) { filters[column] = value; return q; },
    not(column: string, op: string, value: unknown) { state.traces.push(['not', role, table, column, op, value]); return q; },
    maybeSingle() { return Promise.resolve(resolve()); }, single() { return Promise.resolve(resolve()); },
    then(accept: any, reject: any) { return Promise.resolve(resolve()).then(accept, reject); },
  };
  function resolve() {
    state.traces.push(['query', role, table, { ...filters }]);
    if (role === 'caller' && table === 'marketplace_orders') {
      return { data: filters.id === state.order.id ? state.order : null, error: null };
    }
    if (role !== 'admin') throw new Error('UNEXPECTED_CALLER_TABLE');
    if (table === 'account_deletion_revocations') return { data: state.revoked ? { user_id: ids.actor } : null, error: null };
    if (table === 'profiles' && filters.user_id === state.actor) return { data: { blocked_at: state.blocked ? '2026-10-26' : null }, error: null };
    if (table === 'profiles' && filters.organization_id === ids.seller) return { data: state.profiles, error: state.profilesError };
    if (table === 'courses' && filters.source_order_id === ids.order && filters.organization_id === ids.buyer) return { data: state.delivered, error: null };
    if (table === 'courses' && filters.id === ids.source) return { data: state.source, error: null };
    if (table === 'marketplace_courses' && filters.id === ids.listing) return { data: state.listing, error: null };
    if (table === 'organizations' && filters.id === ids.buyer) return { data: { name: state.buyerName }, error: null };
    if (table === 'organizations' && filters.id === ids.seller) return { data: state.sellerError ? null : { name: state.sellerName }, error: state.sellerError };
    throw new Error('UNEXPECTED_ADMIN_QUERY');
  }
  return q;
}
export function createClient(_url: string, key: string, options?: any) {
  const role = key === state.env.SUPABASE_SERVICE_ROLE_KEY ? 'admin' : 'caller';
  state.traces.push(['client', role, options?.global?.headers?.Authorization ?? null]);
  if (role === 'caller' && options?.global?.headers?.Authorization !== 'Bearer original-purchaser-jwt') throw new Error('ORIGINAL_AUTH_NOT_FORWARDED');
  return {
    auth: { async getUser(token: string) { state.traces.push(['auth', token]); return { data: { user: token === 'original-purchaser-jwt' ? { id: state.actor } : null }, error: null }; } },
    from(table: string) { return query(role, table); },
    async rpc(name: string, args: any) {
      state.traces.push(['rpc', role, name, args]);
      if (role === 'caller' && name === 'can_manage_course_files_org' && args._organization_id === ids.buyer && args._permission === 'courses.write') return { data: state.permission, error: null };
      if (role === 'admin' && name === 'claim_notification_dedup' && typeof args._key === 'string') {
        const first = !state.claims.has(args._key); state.claims.add(args._key); return { data: first, error: null };
      }
      throw new Error('UNEXPECTED_RPC');
    },
  };
}
export async function smtpSend(input: any) {
  state.traces.push(['smtp']); state.smtp.push(input);
  if (state.smtpThrows) throw new Error('local-email-private-diagnostic');
  return { ok: state.smtpOk, error: state.smtpOk ? undefined : 'local-email-private-diagnostic' };
}
export async function telegramFetch(input: string | URL | Request, init?: RequestInit) {
  state.traces.push(['telegram']); state.telegram.push({ url: String(input), body: JSON.parse(String(init?.body)), method: init?.method });
  if (state.telegramThrows) throw new Error('https://api.telegram.org/botlocal-bot-placeholder/private-failure');
  return new Response(JSON.stringify({ ok: state.telegramOk, description: state.telegramOk ? undefined : 'private-provider-description' }), { status: state.telegramOk ? 200 : 400 });
}
export function sellerOrder(price = 1000) {
  state.order.price = price; state.listing.organization_id = ids.seller; state.source.organization_id = ids.seller;
}
reset();
