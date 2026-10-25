/** Closed operational events only. Never accepts provider text, prompts, locators or Error objects. */
const events = new Set(['pool_ready','oauth_failed','oauth_ready','request_started','request_succeeded','request_failed','content_moderated','rate_limited','retry_wait','provider_fallback','empty_response','invalid_response','read_failed','network_failed']);
export type AiOperationEvent = 'pool_ready'|'oauth_failed'|'oauth_ready'|'request_started'|'request_succeeded'|'request_failed'|'content_moderated'|'rate_limited'|'retry_wait'|'provider_fallback'|'empty_response'|'invalid_response'|'read_failed'|'network_failed';
export function logAiOperation(level: 'log'|'warn'|'error', event: AiOperationEvent, status?: number): void {
 const safeLevel = level === 'log' || level === 'error' ? level : 'warn';
 const safeEvent = events.has(event) ? event : 'request_failed';
 const code = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
 console[safeLevel]('[AI]', {event:safeEvent, ...(code === undefined ? {} : {status:code})});
}
/** Parsing errors from engines may echo response bytes; expose only a fixed technical code. */
export async function readAiResponseJson(response: Response): Promise<any> {
 try { return await response.json(); } catch { throw new Error('AI_RESPONSE_INVALID'); }
}
export function parseAiToolJson(value: string): any {
 try { return JSON.parse(value); } catch { throw new SyntaxError('AI_TOOL_RESPONSE_INVALID'); }
}
/** Fixed provider URLs remain chosen by the caller; these boundaries never echo transport/body exceptions. */
export async function fetchAiResponse(input: string, init: RequestInit): Promise<Response> {
 try { return await fetch(input, init); } catch { throw new Error('AI_NETWORK_UNAVAILABLE'); }
}
export async function readAiResponseText(response: Response): Promise<string> {
 try { return await response.text(); } catch { throw new Error('AI_RESPONSE_UNAVAILABLE'); }
}
