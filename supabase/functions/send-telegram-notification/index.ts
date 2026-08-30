import { createTelegramRelayHandler } from "./handler.ts";

Deno.serve(createTelegramRelayHandler({
  env: (name) => Deno.env.get(name),
  fetch: globalThis.fetch.bind(globalThis),
}));
