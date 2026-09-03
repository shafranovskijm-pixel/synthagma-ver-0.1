import { describe, expect, it } from "vitest";
import { NGINX_PROXY_CONFIG } from "../nginxProxyConfig";

describe("NGINX proxy Edge Functions CORS contract", () => {
  const edgeFunctionsBlock = () => {
    const start = NGINX_PROXY_CONFIG.indexOf("    location /sb-functions/ {");
    const end = NGINX_PROXY_CONFIG.indexOf("\n    }", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return NGINX_PROXY_CONFIG.slice(start, end);
  };

  it("allows the required compiler revision request header", () => {
    expect(edgeFunctionsBlock()).toContain("x-sintagma-required-compiler-revision");
  });

  it("exposes the compiler revision and request id response headers", () => {
    const block = edgeFunctionsBlock();
    expect(block).toContain("x-sintagma-compiler-revision");
    expect(block).toContain("x-sintagma-request-id");
  });
});
