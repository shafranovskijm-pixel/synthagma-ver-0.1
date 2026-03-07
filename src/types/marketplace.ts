/** Shared marketplace type definitions to reduce `as any` usage */

export interface MarketplaceCourseRecord {
  id: string;
  course_id: string;
  organization_id: string;
  price_student: number;
  price_organization: number;
  is_active: boolean;
  is_validated?: boolean;
  description_short: string | null;
  preview_image_url: string | null;
  created_at: string;
  updated_at?: string;
}

export interface MarketplaceOrderRecord {
  id: string;
  marketplace_course_id: string;
  buyer_user_id: string | null;
  buyer_organization_id: string | null;
  buyer_type: string;
  status: string;
  price: number;
  students_count: number | null;
  notes: string | null;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface MarketplaceCourseWithDetails extends MarketplaceCourseRecord {
  course?: { id: string; title: string; description: string | null; duration: string | null };
  organization?: { name: string } | null;
}

export interface MarketplaceOrderWithDetails extends MarketplaceOrderRecord {
  marketplace_course?: {
    id: string;
    course_id?: string;
    organization_id?: string;
    price_student?: number;
    price_organization?: number;
    is_active?: boolean;
    description_short?: string | null;
    preview_image_url?: string | null;
    created_at?: string;
    course?: { id: string; title: string };
    organization?: { name: string } | null;
  };
  buyer_organization?: { name: string } | null;
}
