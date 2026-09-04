import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./types";

type ExistingPublicSchema = Database["public"];
type ExistingTables = ExistingPublicSchema["Tables"];
type ExistingLibraryDocument = ExistingTables["library_documents"];
type ExistingCourseDocument = ExistingTables["course_documents"];
type ExistingLibraryFolder = ExistingTables["library_folders"];

type LibraryCategory =
  | "legal_acts"
  | "educational_materials"
  | "manufacturer_guides"
  | "additional_resources";
type LibraryStatus = "active" | "needs_review" | "archive";
type LibraryUsageBasis =
  | "official_open_source"
  | "own_material"
  | "rights_holder_permission";

type LibraryDocumentColumns = {
  source_name: string | null;
  external_url: string | null;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  edition_label: string | null;
  last_checked_at: string | null;
  usage_basis: LibraryUsageBasis | null;
  library_status: LibraryStatus | null;
  created_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
};

type CourseDocumentColumns = {
  library_document_id: string | null;
  module_id: string | null;
  library_category: LibraryCategory | null;
  sort_order: number;
  visible_to_students: boolean;
  allow_download: boolean;
};

type LibraryDatabase = {
  __InternalSupabase: Database["__InternalSupabase"];
  public: {
    Tables: {
      library_documents: {
        Row: ExistingLibraryDocument["Row"] & LibraryDocumentColumns;
        Insert: ExistingLibraryDocument["Insert"] & Partial<LibraryDocumentColumns>;
        Update: ExistingLibraryDocument["Update"] & Partial<LibraryDocumentColumns>;
        Relationships: [];
      };
      course_documents: {
        Row: ExistingCourseDocument["Row"] & CourseDocumentColumns;
        Insert: ExistingCourseDocument["Insert"] & Partial<CourseDocumentColumns>;
        Update: ExistingCourseDocument["Update"] & Partial<CourseDocumentColumns>;
        Relationships: [
          {
            foreignKeyName: "course_documents_library_document_id_fkey";
            columns: ["library_document_id"];
            isOneToOne: false;
            referencedRelation: "library_documents";
            referencedColumns: ["id"];
          },
        ];
      };
      library_folders: ExistingLibraryFolder;
    };
    Views: Record<string, never>;
    Functions: {
      get_course_electronic_library_shell: {
        Args: { p_course_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type LibrarySupabaseClient = SupabaseClient<LibraryDatabase>;
