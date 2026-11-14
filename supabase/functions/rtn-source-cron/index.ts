import { authenticateCronRequest } from '../_shared/cron-auth.ts';
import { createRtnRuntime } from '../_shared/rtn/runtime.ts';
import { createRtnScheduledHandler } from '../_shared/rtn/scheduled-handler.ts';

const runtime = createRtnRuntime();
Deno.serve(createRtnScheduledHandler({
  service: runtime.service,
  normalize: runtime.normalize,
  authenticate: authenticateCronRequest,
}));
