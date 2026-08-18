export type DocType =
  | "contract"
  | "enrollment_order"
  | "expulsion_order"
  | "student_list"
  | "class_journal"
  | "schedule"
  | "attestation_sheet"
  | "registration_book"
  | "title_page"
  | "pass";

export interface GenerationContext {
  organization: {
    id?: string | null;
    name: string;
    inn: string;
    kpp: string;
    ogrn: string;
    address: string;
    director_name: string;
    director_position: string;
    bank_name?: string;
    bank_bik?: string;
    bank_account?: string;
    bank_corr_account?: string;
    email?: string;
    phone?: string;
    license?: string;
  };
  group: {
    id: string;
    name: string;
    number: string;
    start_date: string;
    end_date: string;
    program_title: string;
    program_hours: number;
    program_form: string;
    /** Режим занятий из настроек группы. Пусто = условие в договоре нейтральное. */
    schedule_text?: string | null;
    /** Явно выбранные преподаватели через «;»; не подменяются директором. */
    instructor_name?: string | null;
    /** Фактические даты занятий для журнала/расписания. */
    training_dates?: string[];
    color?: string;
  };
  students: Array<{
    user_id: string;
    full_name: string;
    birth_date?: string;
    gender?: "М" | "Ж";
    passport?: string;
    /** Структурированный паспорт (приоритетнее строки passport) */
    passport_series?: string;
    passport_number?: string;
    snils?: string;
    citizenship?: string;
    email?: string;
    phone?: string;
    education?: string;
    position?: string;
    address?: string;
  }>;
  company?: {
    id: string;
    name: string;
    inn: string;
    kpp?: string;
    ogrn?: string;
    address?: string;
    director?: string;
  };
  extras?: Record<string, string | number>;
}

export interface GeneratedDocument {
  id: string;
  doc_type: DocType;
  name: string;
  document_number: string | null;
  document_date: string;
  variables: Record<string, string>;
  html: string;
  status: "active" | "draft";
  created_at: string;
  /** Черновик или финальный документ. Final запрещён при неполных данных. */
  doc_status: "draft" | "final";
  /** Рабочий бланк или заполнение по данным Синтагмы. */
  fill_mode: "blank" | "data";
  /** Формат макета: legacy_html — приближение, не оригинальный DOCX клиента. */
  layout_format: string;
  /** Партия пакетной генерации. */
  package_batch_id?: string | null;
  package_version?: number | null;
  /** Человеческое описание источника данных документа. */
  source_note?: string | null;
}

/**
 * SQL (для миграции в Синтагму):
 *
 * create table group_doc_templates (
 *   id uuid primary key default gen_random_uuid(),
 *   organization_id uuid not null,
 *   doc_type text not null,
 *   name text not null,
 *   body_html text not null,
 *   is_default boolean default false,
 *   created_at timestamptz default now()
 * );
 *
 * create table group_documents (
 *   id uuid primary key default gen_random_uuid(),
 *   organization_id uuid not null,
 *   group_id uuid not null,
 *   doc_type text not null,
 *   name text not null,
 *   document_number text,
 *   document_date date,
 *   variables jsonb not null default '{}',
 *   file_path text,
 *   status text not null default 'active',
 *   student_user_id uuid,
 *   company_id uuid,
 *   created_at timestamptz default now()
 * );
 */
