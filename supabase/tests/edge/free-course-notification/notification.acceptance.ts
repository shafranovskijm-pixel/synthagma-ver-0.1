import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { handler, ids, reset, sellerOrder, state, telegramFetch } from './ports/state.ts';

beforeAll(async () => { await import('../../../functions/notify-course-order/index.ts'); });
beforeEach(() => {
  reset();
  vi.stubGlobal('Deno', { env: { get: (name: string) => state.env[name] } });
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn(telegramFetch));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function request(body: Record<string, unknown> = {}, authorization = 'Bearer original-purchaser-jwt') {
  return new Request('https://edge.invalid/notify-course-order', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
    body: JSON.stringify({ orderId: ids.order, ...body }),
  });
}
async function invoke(body: Record<string, unknown> = {}, authorization?: string) {
  const response = await handler(request(body, authorization));
  return { response, body: await response.json() };
}
function claims(channel: string) {
  return state.traces.filter((t: any[]) => t[0] === 'rpc' && t[2] === 'claim_notification_dedup' && t[3]._key.includes(':' + channel + ':'));
}
function assertNoDelivery() { expect(state.telegram).toHaveLength(0); expect(state.smtp).toHaveLength(0); expect(claims('telegram')).toHaveLength(0); }
function loggedText() {
  return [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls].flat().map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('\n');
}

describe('free own-course receipt notification — actual handler and actual authorization', () => {
  it('N01: NULL platform seller and no seller email still attempts only the fixed Telegram recipient', async () => {
    const result = await invoke();
    expect(result.response.status).toBe(200); expect(result.body).toEqual({ success: true, recipientsCount: 0 });
    expect(state.telegram).toHaveLength(1); expect(state.smtp).toHaveLength(0);
    expect(state.telegram[0].body.chat_id).toBe('local-chat');
    expect(state.telegram[0].body.text).toContain('Курс получен бесплатно');
    expect(state.telegram[0].body.text).not.toContain('банковский');
    expect(state.telegram[0].body.text).not.toContain('оплачено');
    expect(state.telegram[0].body.text).toContain('СИНТАГМА');
    expect(state.traces.some((t: any[]) => t[0] === 'query' && t[2] === 'profiles' && t[3].organization_id)).toBe(false);
    expect(state.traces).toContainEqual(['client', 'caller', 'Bearer original-purchaser-jwt']);
  });
  it('N02: an authenticated delivered zero-price order with a seller but empty profiles still reaches Telegram', async () => {
    sellerOrder(0);
    const result = await invoke();
    expect(result.response.status).toBe(200); expect(state.telegram).toHaveLength(1); expect(state.smtp).toHaveLength(0);
    expect(state.telegram[0].body.text).toContain('Продавец &lt;центр&gt;');
  });
  it('N03: existing paid client order retains only its seller email recipients and fixed support chat', async () => {
    sellerOrder(); state.profiles = [{ email: 'seller@example.invalid' }, { email: null }];
    const result = await invoke();
    expect(result.body).toEqual({ success: true, recipientsCount: 1 });
    expect(state.smtp.map((r: any) => r.to)).toEqual(['seller@example.invalid']);
    expect(state.smtp[0].subject).toContain('Новая заявка на курс');
    expect(state.telegram[0].body.text).toContain('Новая заявка на курс!');
    expect(state.telegram[0].body.text).not.toContain('не подтверждает банковский платёж');
    expect(state.telegram[0].body.chat_id).toBe('local-chat');
  });
  it('N04: body-forged names, prices, seller and Telegram recipient cannot override trusted DB facts', async () => {
    await invoke({ price: 999, courseName: 'FORGED', buyerName: 'FORGED', sellerOrganizationId: ids.other, chat_id: 'FORGED', notes: 'FORGED' });
    expect(state.telegram).toHaveLength(1);
    expect(state.telegram[0].body.text).toContain('Курс &lt;безопасность&gt;');
    expect(state.telegram[0].body.text).toContain('Покупатель &lt;центр&gt;');
    expect(JSON.stringify(state.telegram[0].body)).not.toContain('FORGED');
  });
  it('N05: duplicate invocations share the existing hashed per-order/channel/recipient claim and make one attempt', async () => {
    await invoke(); await invoke();
    expect(state.telegram).toHaveLength(1); expect(claims('telegram')).toHaveLength(2);
    const expectedDigest = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('local-chat'))).toString('hex');
    expect(claims('telegram')[0][3]._key).toBe('marketplace-order-notify:v1:' + ids.order + ':telegram:' + expectedDigest);
    expect(claims('telegram')[0][3]._key).not.toContain('local-chat');
  });
  it('N06: SMTP transport throws only after Telegram was attempted; no raw mail error is logged', async () => {
    sellerOrder(); state.profiles = [{ email: 'seller@example.invalid' }]; state.smtpThrows = true;
    const result = await invoke();
    expect(result.response.status).toBe(500); expect(state.telegram).toHaveLength(1);
    expect(state.traces.findIndex((t: any[]) => t[0] === 'telegram')).toBeLessThan(state.traces.findIndex((t: any[]) => t[0] === 'smtp'));
    expect(loggedText()).not.toContain('local-email-private-diagnostic');
  });
  it('N07: Telegram network error is a closed failure event and never logs the bot URL/token', async () => {
    state.telegramThrows = true;
    const result = await invoke();
    expect(result.response.status).toBe(200); expect(state.telegram).toHaveLength(1);
    expect(loggedText()).toContain('telegram_notification_failed');
    expect(loggedText()).not.toContain('local-bot-placeholder'); expect(loggedText()).not.toContain('api.telegram.org');
  });
  it('N08: provider rejection description is not logged or returned', async () => {
    state.telegramOk = false;
    const result = await invoke();
    expect(state.telegram).toHaveLength(1); expect(loggedText()).toContain('telegram_notification_failed');
    expect(loggedText()).not.toContain('private-provider-description'); expect(JSON.stringify(result.body)).not.toContain('private-provider-description');
  });
  it('N09: missing configured support destination does not invent a recipient or consume a claim', async () => {
    delete state.env.TELEGRAM_SUPPORT_CHAT_ID;
    expect((await invoke()).response.status).toBe(200); assertNoDelivery();
  });
  it('N10: missing user authorization is 401 and no notification claim or external delivery occurs', async () => {
    expect((await invoke({}, '')).response.status).toBe(401); assertNoDelivery();
  });
  it('N11: account revocation denies before course/recipient reads and notifications', async () => {
    state.revoked = true;
    expect((await invoke()).response.status).toBe(403); assertNoDelivery();
    expect(state.traces.some((t: any[]) => t[0] === 'query' && t[2] === 'courses')).toBe(false);
  });
  it('N12: blocked purchaser cannot emit a free-course notification', async () => {
    state.blocked = true; expect((await invoke()).response.status).toBe(403); assertNoDelivery();
  });
  it('N13: a different authenticated actor is not the original purchaser', async () => {
    state.actor = ids.other; expect((await invoke()).response.status).toBe(403); assertNoDelivery();
  });
  it('N14: original-caller courses.write denial prevents all privileged course/recipient reads', async () => {
    state.permission = false; expect((await invoke()).response.status).toBe(403); assertNoDelivery();
    expect(state.traces.some((t: any[]) => t[0] === 'query' && t[2] === 'courses')).toBe(false);
  });
  it('N15: a zero price never bypasses paid/completed status', async () => {
    state.order.status = 'pending'; expect((await invoke()).response.status).toBe(403); assertNoDelivery();
  });
  it('N16: a zero price never bypasses a valid paid_at delivery timestamp', async () => {
    state.order.paid_at = null; expect((await invoke()).response.status).toBe(403); assertNoDelivery();
  });
  it('N17: delivered copy must belong to this buyer organization and order', async () => {
    state.delivered.organization_id = ids.seller; expect((await invoke()).response.status).toBe(403); assertNoDelivery();
  });
  it('N18: a NULL seller cannot disguise a customer-owned source course as the platform', async () => {
    state.source.organization_id = ids.seller; expect((await invoke()).response.status).toBe(403); assertNoDelivery();
  });
  it('N19: delivery source and exact marketplace listing must agree', async () => {
    state.listing.course_id = ids.delivered; expect((await invoke()).response.status).toBe(403); assertNoDelivery();
  });
  it('N20: a failed Telegram attempt remains consumed under the existing claim, never advertised as retry-safe delivery', async () => {
    state.telegramThrows = true; await invoke(); state.telegramThrows = false; await invoke();
    expect(state.telegram).toHaveLength(1); expect(claims('telegram')).toHaveLength(2);
  });
  it('N21: seller email lookup error skips email but still attempts the fixed Telegram destination', async () => {
    sellerOrder(); state.profilesError = { message: 'local-email-query-private-diagnostic' };
    expect((await invoke()).response.status).toBe(200);
    expect(state.telegram).toHaveLength(1); expect(state.smtp).toHaveLength(0);
    expect(state.telegram[0].body.chat_id).toBe('local-chat');
    expect(claims('smtp')).toHaveLength(0);
    expect(loggedText()).toContain('smtp_delivery_failed');
    expect(loggedText()).not.toContain('local-email-query-private-diagnostic');
  });
  it('N22: completed fulfilled orders remain compatible and use the same fixed recipient/claim', async () => {
    state.order.status = 'completed'; expect((await invoke()).response.status).toBe(200);
    expect(state.telegram).toHaveLength(1); expect(claims('telegram')).toHaveLength(1);
  });
  it('N23: failed seller-org lookup uses a neutral label, skips email discovery and still attempts fixed Telegram', async () => {
    sellerOrder(); state.sellerError = { message: 'local-seller-query-private-diagnostic' };
    state.profiles = [{ email: 'must-not-send@example.invalid' }];
    const result = await invoke();
    expect(result.response.status).toBe(200); expect(state.telegram).toHaveLength(1); expect(state.smtp).toHaveLength(0);
    expect(state.telegram[0].body.chat_id).toBe('local-chat');
    expect(state.telegram[0].body.text).toContain('Организация продавца');
    expect(state.telegram[0].body.text).not.toContain('Продавец &lt;центр&gt;');
    expect(state.traces.some((t: any[]) => t[0] === 'query' && t[2] === 'profiles' && t[3].organization_id)).toBe(false);
    expect(claims('smtp')).toHaveLength(0); expect(loggedText()).toContain('smtp_delivery_failed');
    expect(loggedText()).not.toContain('local-seller-query-private-diagnostic');
  });
  it('N24: serialized Telegram text contains real line breaks and no literal backslash-n separator', async () => {
    await invoke();
    expect(state.telegram).toHaveLength(1);
    expect(state.telegram[0].body.text.includes('\n')).toBe(true);
    expect(state.telegram[0].body.text.includes('\\n')).toBe(false);
  });  it('N25: free seller email uses simple receipt wording without bank/payment implementation disclaimers', async () => {
    sellerOrder(0); state.profiles = [{ email: 'seller@example.invalid' }];
    expect((await invoke()).response.status).toBe(200);
    expect(state.smtp).toHaveLength(1);
    expect(state.smtp[0].subject).toContain('Курс получен бесплатно');
    expect(state.smtp[0].html).toContain('Курс получен бесплатно.');
    expect(state.smtp[0].html).not.toContain('банковский');
    expect(state.smtp[0].html).not.toContain('оплачено');
    expect(state.telegram[0].body.text).toContain('Тип: Организация');
  });
});
