export const org = "10000000-0000-4000-8000-000000000001", course = "10000000-0000-4000-8000-000000000002";
export const second = "10000000-0000-4000-8000-000000000003", person = "10000000-0000-4000-8000-000000000004";
export function approvedBinding(courseId = course, form = "part_time", kind = "dpo_upskilling") {
  const version = "10000000-0000-4000-8000-000000000005", program = "10000000-0000-4000-8000-000000000006";
  return { revision: 1, binding: { course_id: courseId, organization_id: org, revision: 1, version_id: version, program_id: program, recorded_at: "2026-10-24T00:00:00Z", recorded_by: person },
    version: { id: version, organization_id: org, program_id: program, version_number: 1, revision: 1, state: "approved",
      file_document_id: course, file_version_id: second, file_review_id: person,
      file_approval: { number: "Synthetic approval", date: "2026-10-01", recorded_at: "2026-10-01T00:00:00Z", recorded_by: person },
      facts: { schema_version: 1, full_title: "Synthetic approved course", program_type: kind, academic_hours: 16, training_form: form,
        uses_elearning: true, uses_distance_learning: true, duration_calendar: "Two days", attestation_form: "Test", attestation_criteria: "Synthetic criteria", qualification: null, profession: null },
      facts_hash: "a".repeat(64), reviewer_user_id: person, reviewer_name: "Synthetic reviewer", created_by: person, created_by_name: "Synthetic author",
      created_at: "2026-10-01T00:00:00Z", approved_at: "2026-10-02T00:00:00Z", approved_by: person, note: null } };
}
