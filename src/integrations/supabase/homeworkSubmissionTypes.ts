import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database as GeneratedDatabase } from "./types";

// Keep the lossless PostgreSQL BIGINT input contract outside regenerated types.
// Only this insert accepts decimal strings; reads, updates and other columns
// retain their generated types and the existing runtime validators.
type PublicSchema = GeneratedDatabase["public"];
type HomeworkTable = PublicSchema["Tables"]["homework_submissions"];
type GeneratedInsert = HomeworkTable["Insert"];
type HomeworkInsert = {
  [Key in keyof GeneratedInsert]: Key extends "learning_progress_epoch"
    ? GeneratedInsert[Key] | string
    : GeneratedInsert[Key];
};
type HomeworkDatabase = Omit<GeneratedDatabase, "public"> & {
  public: Omit<PublicSchema, "Tables"> & {
    Tables: Omit<PublicSchema["Tables"], "homework_submissions"> & {
      homework_submissions: Omit<HomeworkTable, "Insert"> & { Insert: HomeworkInsert };
    };
  };
};

/** Type-only view of the existing client; never creates a client or session. */
export type HomeworkSubmissionClient = SupabaseClient<HomeworkDatabase>;
