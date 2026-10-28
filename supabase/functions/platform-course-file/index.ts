import { createPlatformCourseFileByteHandlers } from '../_shared/platform-course-file-byte-handlers.ts';

// Runtime secrets only. Never return/log configuration or use request-provided
// hosts, keys, SQL stamps, source locators, hashes or approval decisions.
let handlers: ReturnType<typeof createPlatformCourseFileByteHandlers> | null = null;
try {
  handlers = createPlatformCourseFileByteHandlers({
    publicApiKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    workerServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    expectedEnforcementSHA256: Deno.env.get('PCF_ENFORCEMENT_SHA256') ?? '',
  });
} catch { /* Fail closed below; configuration values are never disclosed. */ }

function failure(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), { status, headers: {
    'Content-Type': 'application/json;charset=utf-8',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}

Deno.serve((request: Request): Promise<Response> | Response => {
  const path = new URL(request.url).pathname;
  // Supabase gateway and the existing fixed reverse proxy retain these exact
  // route prefixes. No suffix wildcard, redirect, query-selected operation, or
  // client-supplied source path is accepted.
  const bases = ['/platform-course-file', '/functions/v1/platform-course-file', '/sb-api/functions/v1/platform-course-file'];
  const capture = bases.some(base => path === base + '/capture');
  const read = bases.some(base => path === base + '/read');
  if (!capture && !read) return failure('PCF_ROUTE_NOT_FOUND', 404);
  if (!handlers) return failure('PCF_SERVER_CONFIGURATION_REQUIRED', 503);
  // Each factory method revalidates CORS, method, original ordinary bearer with
  // Auth/user, then current server SQL/account/course authority. Gateway JWT
  // verification is additional protection, never the sole authorization check.
  return capture ? handlers.capture(request) : handlers.read(request);
});
