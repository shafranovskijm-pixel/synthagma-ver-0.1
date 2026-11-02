import type { Plugin } from "vite";

export interface SupportMcpEventsBundler {
  build(options: Record<string, unknown>): Promise<{
    outputFiles?: ReadonlyArray<{ contents: Uint8Array }>;
  }>;
}

export interface SupportMcpEventsBuildResult {
  sdkVersion: "0.23.0";
  wrapperVersion: 1;
  adapterSha256: string;
  entrySha256: string;
  sourceEntrySha256: string;
  alreadyWrapped: boolean;
}

export function wrapGeneratedMcp(source: string): string;
export function buildSupportMcpEvents(
  rootDir: string,
  options?: { esbuild?: SupportMcpEventsBundler },
): Promise<SupportMcpEventsBuildResult>;
export function supportMcpEventsBuildPlugin(rootDir: string): Plugin;
