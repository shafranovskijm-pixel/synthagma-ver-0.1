import { createRtnSourceUploadHandler } from '../_shared/rtn/source-upload-handler.ts';
import { createRtnSourceUploadRuntime } from '../_shared/rtn/source-upload-runtime.ts';

Deno.serve(createRtnSourceUploadHandler(createRtnSourceUploadRuntime()));
