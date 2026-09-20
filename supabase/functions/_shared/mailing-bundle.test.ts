import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const functionsRoot = resolve(__dirname, "..");
const entries = [
  "send-campaign-email", "run-email-campaign", "process-scheduled-campaigns",
  "process-paused-campaigns", "inbox-scanner", "notify-mailing-campaign-report",
];

function localImports(source: string): string[] {
  const imports: string[] = [];
  const add = (node: ts.Node | undefined) => {
    if (node && ts.isStringLiteralLike(node) && node.text.startsWith(".")) imports.push(node.text);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile("bundle.ts", source, ts.ScriptTarget.Latest, true));
  return imports;
}

// Lovable deploys only the selected function folder and _shared. Traverse source
// before transpilation so erased type imports cannot hide a missing bundle file.
function bundleClosure(entry: string, readSource = (file: string) => readFileSync(file, "utf8")): string[] {
  const roots = [resolve(functionsRoot, entry), resolve(functionsRoot, "_shared")];
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (!roots.some((root) => {
      const path = relative(root, file);
      return path !== ".." && !path.startsWith("../") && !path.startsWith("..\\") && !isAbsolute(path);
    })) throw new Error(`Outside ${entry} deploy bundle: ${relative(functionsRoot, file)}`);
    if (seen.has(file)) return;
    seen.add(file);
    for (const specifier of localImports(readSource(file))) visit(resolve(file, "..", specifier));
  };
  visit(resolve(functionsRoot, entry, "index.ts"));
  return [...seen];
}

describe("mailing Edge source bundle closure (not a live deployment)", () => {
  // Keep the release SDK pin aligned. Changing it requires checking the actual
  // Edge runtime dependency graph, not only typechecking or mocked handlers.
  it.each(entries)("keeps %s on the release-pinned Supabase SDK", (entry) => {
    const source = readFileSync(resolve(functionsRoot, entry, "index.ts"), "utf8");
    const imports = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true).statements
      .filter(ts.isImportDeclaration)
      .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text)
      .filter((specifier) => specifier.includes("@supabase/supabase-js"));
    const target = entry === "inbox-scanner" ? "?target=deno" : "";
    expect(imports).toEqual([`https://esm.sh/@supabase/supabase-js@2.45.0${target}`]);
  });

  it.each(entries)("keeps every local dependency of %s inside its deploy bundle", (entry) => {
    expect(bundleClosure(entry).length).toBeGreaterThan(0);
  });

  it("includes the shared sender implementation in the runner bundle", () => {
    expect(bundleClosure("run-email-campaign")).toContain(resolve(functionsRoot, "_shared/platform-sender.ts"));
  });

  it.each([
    'import type { Row } from "../other-function/types.ts";',
    'export type { Row } from "../other-function/types.ts";',
    'type Row = import("../other-function/types.ts").Row;',
    'const dependency = import("../other-function/types.ts");',
  ])("rejects a cross-function dependency before type erasure: %s", (source) => {
    expect(() => bundleClosure("fixture", () => source)).toThrow("Outside fixture deploy bundle");
  });

  it("follows shared re-exports transitively and stops at bundle boundaries", () => {
    const files = new Map([
      [resolve(functionsRoot, "fixture/index.ts"), 'export * from "../_shared/fixture.ts";'],
      [resolve(functionsRoot, "_shared/fixture.ts"), 'export * from "../other-function/private.ts";'],
    ]);
    expect(() => bundleClosure("fixture", (file) => {
      const source = files.get(file);
      if (source === undefined) throw new Error(`Unexpected file: ${file}`);
      return source;
    })).toThrow("Outside fixture deploy bundle");
  });
});
