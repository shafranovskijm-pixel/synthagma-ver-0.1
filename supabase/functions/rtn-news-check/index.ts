import { createRtnNewsRuntime } from '../_shared/rtn/news-runtime.ts';
import { createRtnNewsManualHandler } from '../_shared/rtn/news-handlers.ts';

Deno.serve(createRtnNewsManualHandler(createRtnNewsRuntime()));
