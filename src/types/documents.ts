// Document types
export interface OrgDocument {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyDocument {
  id: string;
  company_id: string;
  name: string;
  type: string;
  file_url: string | null;
  file_path: string | null;
  file_size: number | null;
  uploaded_at: string;
  uploaded_by: string | null;
  // Contract specific fields
  contract_number: string | null;
  contract_date: string | null;
  course_id: string | null;
  students_count: number | null;
  amount: number | null;
  is_paid: boolean | null;
  paid_at: string | null;
}

export interface ConsentDocument {
  id: string;
  organization_id: string;
  student_user_id: string | null;
  consent_type: string;
  content_html: string;
  full_name: string | null;
  passport_data: string | null;
  address: string | null;
  company_name: string | null;
  company_inn: string | null;
  company_director: string | null;
  company_address: string | null;
  created_at: string;
  created_by: string | null;
}

export interface EducationDocumentRecord {
  id: string;
  organization_id: string;
  enrollment_id: string | null;
  full_name: string;
  birth_date: string | null;
  specialty_name: string;
  qualification_name: string | null;
  document_type: string;
  document_series: string | null;
  document_number: string;
  reg_number: string;
  issue_date: string;
  document_status: string;
  order_number: string | null;
  order_date: string | null;
  protocol_number: string | null;
  protocol_date: string | null;
  original_document_data: string | null;
  delivery_method: string;
  delivery_details: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentIssuanceLogEntry {
  id: string;
  organization_id: string;
  user_id: string;
  user_name: string;
  enrollment_id: string | null;
  document_type: string;
  document_name: string;
  reg_number: string | null;
  file_url: string | null;
  send_method: string | null;
  send_number: string | null;
  issued_at: string;
  created_at: string;
}

export interface LibraryFolder {
  id: string;
  organization_id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
  created_at: string;
}

export interface LibraryDocument {
  id: string;
  organization_id: string;
  folder_id: string | null;
  name: string;
  type: string;
  description: string | null;
  file_url: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

export type DocumentType = 
  | "enrollment_order"
  | "expulsion_order"
  | "attestation_protocol"
  | "certificate"
  | "diploma"
  | "contract"
  | "invoice"
  | "act"
  | "consent"
  | "other";
