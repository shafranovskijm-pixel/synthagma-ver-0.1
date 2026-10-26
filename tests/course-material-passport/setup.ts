import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { afterAll } from "vitest";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
Object.defineProperty(globalThis, "TextEncoder", { value: TextEncoder, configurable: true });
let fetchCalls = 0;
globalThis.fetch = (() => { fetchCalls += 1; throw new Error("No network in passport tests"); }) as typeof fetch;
afterAll(() => { if (fetchCalls !== 0) throw new Error("Unexpected fetch in passport tests"); });
