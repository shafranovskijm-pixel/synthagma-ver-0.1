import { z } from "zod";
const uuid = z.string().uuid();
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/);
export const templateTargetKindSchema = z.enum(["contract_template_version", "org_document_version"]);
export type TemplateTargetKind = z.infer<typeof templateTargetKindSchema>;
const hashScope = z.enum(["contract_name_html_variables", "document_metadata_reference_not_file_bytes"]);
export const templateTargetSchema = z.object({ kind: templateTargetKindSchema, versionId: uuid, parentId: uuid.nullable(), versionNumber: revision.refine(n => n > 0).nullable(),
  label: z.string().max(400).nullable(), contentSha256: sha.nullable(), hashScope, availability: z.enum(["available", "unavailable"]) }).strict().superRefine((target, ctx) => {
  if ((target.kind === "contract_template_version") !== (target.hashScope === "contract_name_html_variables")
    || target.availability === "available" && (target.parentId === null || target.versionNumber === null || target.contentSha256 === null || target.label === null)
    || target.availability === "unavailable" && (target.parentId !== null || target.versionNumber !== null || target.contentSha256 !== null || target.label !== null)) ctx.addIssue({ code: "custom", message: "NORMATIVE_TEMPLATE_TARGET_INVALID" });
});
export type TemplateTarget = z.infer<typeof templateTargetSchema>;
export const templateVersionSchema = z.object({ kind: templateTargetKindSchema, versionId: uuid, parentId: uuid.nullable(), versionNumber: revision.refine(n => n > 0).nullable(),
  label: z.string().max(400).nullable(), contentSha256: sha.nullable(), hashScope, availability: z.enum(["available", "unavailable"]), activeLinks: revision }).strict()
  .superRefine((value, ctx) => { const { activeLinks: _, ...target } = value; if (!templateTargetSchema.safeParse(target).success) ctx.addIssue({ code: "custom", message: "NORMATIVE_TEMPLATE_TARGET_INVALID" }); });
export type TemplateVersion = z.infer<typeof templateVersionSchema>;
export const templateLinkSchema = z.object({ id: uuid, revision: revision.refine(n => n > 0), target: templateTargetSchema, pinnedParentId: uuid,
  pinnedVersionNumber: revision.refine(n => n > 0), pinnedTargetSha256: sha, manifestId: uuid, manifestSha256: sha, sourceId: identifier, sourceSha256: sha,
  action: z.enum(["link", "unlink"]), reason: z.string().min(1).max(2000), actorId: uuid, occurredAt: z.string().datetime({ offset: true }),
  targetState: z.enum(["matching", "changed", "unavailable"]), sourceState: z.enum(["matching", "changed", "removed"]), impacted: z.boolean(),
  sourceStatus: z.object({ checked: z.boolean(), legalReviewed: z.boolean(), published: z.boolean() }).strict(), legalComplianceConfirmed: z.literal(false) }).strict().superRefine((link, ctx) => {
  const expected = link.target.availability === "unavailable" ? "unavailable" : link.target.contentSha256 === link.pinnedTargetSha256 ? "matching" : "changed";
  if (link.targetState !== expected || link.targetState === "matching" && (link.target.parentId !== link.pinnedParentId || link.target.versionNumber !== link.pinnedVersionNumber) || link.action === "link" && link.sourceState !== "matching" && !link.impacted || link.action === "unlink" && link.impacted || link.sourceStatus.published && !link.sourceStatus.legalReviewed) ctx.addIssue({ code: "custom", message: "NORMATIVE_TEMPLATE_LINK_INVALID" });
});
export type TemplateLink = z.infer<typeof templateLinkSchema>;
export type TemplateQuery =
  | { kind: "versions"; targetKind: TemplateTargetKind; afterId: string | null; limit: 25 }
  | { kind: "links" | "history"; targetKind: TemplateTargetKind; targetVersionId: string; afterRevision: number | null; limit: 25 }
  | { kind: "impacts"; afterRevision: number | null; limit: 25 };
export const templateCommandSchema = z.object({ action: z.enum(["link", "unlink"]), targetKind: templateTargetKindSchema, targetVersionId: uuid, targetSha256: sha,
  manifestId: uuid, manifestSha256: sha, sourceId: identifier, sourceSha256: sha, reason: z.string().min(1).max(2000).refine(value => !!value.trim()) }).strict();
export type TemplateCommand = z.infer<typeof templateCommandSchema>;
const pageBase = { schemaVersion: z.literal(1), organizationId: uuid, actorId: uuid, manifestId: uuid, manifestSha256: sha, revision,
  complete: z.boolean(), nextAfterId: uuid.nullable(), nextAfterRevision: revision.refine(n => n > 0).nullable(), changedSourceIds: z.array(identifier).max(1000),
  legacySettingsCoverage: z.literal("unknown_no_backfill"), legalComplianceConfirmed: z.literal(false) };
const pageSchema = z.discriminatedUnion("kind", [
  z.object({ ...pageBase, kind: z.literal("versions"), items: z.array(templateVersionSchema).max(25) }).strict(),
  z.object({ ...pageBase, kind: z.enum(["links", "history", "impacts"]), items: z.array(templateLinkSchema).max(25) }).strict(),
]);
export type TemplateAssociationPage = z.infer<typeof pageSchema>;
export function parseTemplatePage(input: unknown, context: { organizationId: string; actorId: string; manifestId: string; manifestSha256: string }, query: TemplateQuery): TemplateAssociationPage {
  const page = pageSchema.parse(input);
  if (page.organizationId !== context.organizationId || page.actorId !== context.actorId || page.manifestId !== context.manifestId || page.manifestSha256 !== context.manifestSha256 || page.kind !== query.kind
    || new Set(page.changedSourceIds).size !== page.changedSourceIds.length) throw Error("NORMATIVE_TEMPLATE_CONTEXT_CHANGED");
  if (page.kind === "versions" && query.kind === "versions") {
    if (page.nextAfterRevision !== null || page.complete !== (page.nextAfterId === null) || !page.complete && (page.items.length !== 25 || page.nextAfterId !== page.items.at(-1)?.versionId)
      || new Set(page.items.map(item => item.versionId)).size !== page.items.length || page.items.some((item, i) => item.kind !== query.targetKind || query.afterId !== null && item.versionId >= query.afterId || i > 0 && item.versionId >= page.items[i - 1].versionId)) throw Error("NORMATIVE_TEMPLATE_PAGE_INVALID");
  } else if (page.kind !== "versions" && query.kind !== "versions") {
    if (page.nextAfterId !== null || page.complete !== (page.nextAfterRevision === null) || !page.complete && (page.items.length !== 25 || page.nextAfterRevision !== page.items.at(-1)?.revision)
      || new Set(page.items.map(item => item.id)).size !== page.items.length || page.items.some((item, i) => item.revision > page.revision || query.afterRevision !== null && item.revision >= query.afterRevision || i > 0 && item.revision >= page.items[i - 1].revision
        || query.kind !== "impacts" && (item.target.kind !== query.targetKind || item.target.versionId !== query.targetVersionId)
        || query.kind === "impacts" && (item.action !== "link" || !item.impacted))) throw Error("NORMATIVE_TEMPLATE_PAGE_INVALID");
  } else throw Error("NORMATIVE_TEMPLATE_PAGE_INVALID");
  return page;
}
export const templateReceiptSchema = z.object({ receipt: z.object({ id: uuid, organizationId: uuid, actorId: uuid, requestId: uuid, revision: revision.refine(n => n > 0),
  targetKind: templateTargetKindSchema, targetVersionId: uuid, sourceId: identifier, action: z.enum(["link", "unlink"]) }).strict() }).strict();
export function confirmTemplateReceipt(input: unknown, context: { organizationId: string; actorId: string; requestId: string; expectedRevision: number }, command: TemplateCommand) {
  const { receipt } = templateReceiptSchema.parse(input);
  if (receipt.organizationId !== context.organizationId || receipt.actorId !== context.actorId || receipt.requestId !== context.requestId || receipt.revision !== context.expectedRevision + 1
    || receipt.targetKind !== command.targetKind || receipt.targetVersionId !== command.targetVersionId || receipt.sourceId !== command.sourceId || receipt.action !== command.action) throw Error("NORMATIVE_TEMPLATE_WRITE_UNCONFIRMED");
  return receipt;
}
