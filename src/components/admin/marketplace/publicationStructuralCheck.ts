import { platformCoursePublication } from "@/api/platformCoursePublication";
import { PublicationError, type PublicationTarget } from "@/lib/platformCoursePublication";
import { validateCourseIssues, validateCourseIssuesSimple, type ValidationRulesConfig } from "./validationHelpers";

/** Existing manual/Simple predicates, read-only, bound to one current edition. */
export async function checkMarketplacePublicationStructure(
  target: PublicationTarget, expectedEdition: string, rules: ValidationRulesConfig, simple = false,
): Promise<string[]> {
  const before = await platformCoursePublication.readiness(target);
  if (before.state === "out_of_scope" || before.editionSha256 !== expectedEdition) throw new PublicationError("stale");
  const issues = await (simple ? validateCourseIssuesSimple : validateCourseIssues)(target.courseId, rules);
  const after = await platformCoursePublication.readiness(target);
  if (after.state === "out_of_scope" || after.editionSha256 !== expectedEdition) throw new PublicationError("stale");
  return issues;
}
