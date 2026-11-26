const ERROR_BODY_MAX_BYTES = 8192;

/** Read only a bounded clone; the SDK's original response remains untouched. */
export async function artifactErrorPayload(context: unknown, remainingMs: number, check: () => void): Promise<unknown> {
  check();
  if (!(context instanceof Response) || !Number.isFinite(remainingMs) || remainingMs <= 0) throw Error('UNKNOWN_ARTIFACT_RESPONSE');
  if (context.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !context.body) throw Error('UNKNOWN_ARTIFACT_RESPONSE');
  const declared = context.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > ERROR_BODY_MAX_BYTES)) throw Error('UNKNOWN_ARTIFACT_RESPONSE');
  const response = context.clone();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(Error('UNKNOWN_ARTIFACT_RESPONSE')), Math.min(65000, remainingMs));
  });
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), timeout]);
      check();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > ERROR_BODY_MAX_BYTES) throw Error('UNKNOWN_ARTIFACT_RESPONSE');
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {bytes.set(part, offset); offset += part.length;}
    const value: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    check();
    return value;
  } finally {
    if (timer) clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
    try {reader.releaseLock();} catch { /* The cancelled pending read can settle later. */ }
  }
}
