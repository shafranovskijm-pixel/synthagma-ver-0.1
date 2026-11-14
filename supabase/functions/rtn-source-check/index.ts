import { createRtnHandler } from '../_shared/rtn/http-handler.ts';
import { createRtnRuntime } from '../_shared/rtn/runtime.ts';

Deno.serve(createRtnHandler(createRtnRuntime()));
