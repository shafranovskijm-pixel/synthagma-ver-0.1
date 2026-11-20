import { authenticateCronRequest } from '../_shared/cron-auth.ts';
import { createRtnNewsRuntime } from '../_shared/rtn/news-runtime.ts';
import { createRtnNewsScheduledHandler } from '../_shared/rtn/news-handlers.ts';

Deno.serve(createRtnNewsScheduledHandler({ ...createRtnNewsRuntime(), authenticate: authenticateCronRequest }));
