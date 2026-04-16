export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string
          code: string
          color: string
          condition_type: string
          condition_value: number | null
          created_at: string
          description: string
          icon: string
          id: string
          is_secret: boolean | null
          is_template: boolean
          name: string
          organization_id: string | null
          rarity: string
        }
        Insert: {
          category: string
          code: string
          color?: string
          condition_type: string
          condition_value?: number | null
          created_at?: string
          description: string
          icon: string
          id?: string
          is_secret?: boolean | null
          is_template?: boolean
          name: string
          organization_id?: string | null
          rarity?: string
        }
        Update: {
          category?: string
          code?: string
          color?: string
          condition_type?: string
          condition_value?: number | null
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_secret?: boolean | null
          is_template?: boolean
          name?: string
          organization_id?: string | null
          rarity?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_branding: {
        Row: {
          branding: Json | null
          cover_url: string | null
          id: string
          logo_url: string | null
          updated_at: string | null
        }
        Insert: {
          branding?: Json | null
          cover_url?: string | null
          id?: string
          logo_url?: string | null
          updated_at?: string | null
        }
        Update: {
          branding?: Json | null
          cover_url?: string | null
          id?: string
          logo_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          metadata: Json | null
          related_entity_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          related_entity_id?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          metadata?: Json | null
          related_entity_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      admin_org_messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          content: string | null
          created_at: string
          id: string
          is_read: boolean
          organization_id: string
          sender_role: string
          sender_user_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          organization_id: string
          sender_role?: string
          sender_user_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          organization_id?: string
          sender_role?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_org_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_staff: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          concurrency: number | null
          context: string
          extra_config: Json | null
          gigachat_model: string | null
          id: string
          lovable_model: string | null
          provider: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          concurrency?: number | null
          context: string
          extra_config?: Json | null
          gigachat_model?: string | null
          id?: string
          lovable_model?: string | null
          provider?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          concurrency?: number | null
          context?: string
          extra_config?: Json | null
          gigachat_model?: string | null
          id?: string
          lovable_model?: string | null
          provider?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          created_at: string
          function_name: string
          id: string
          organization_id: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          organization_id: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          organization_id?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          ip_address: string | null
          organization_id: string
          user_agent: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          organization_id: string
          user_agent?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          organization_id?: string
          user_agent?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          organization_id: string
          performed_by: string | null
          related_order_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
          performed_by?: string | null
          related_order_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
          performed_by?: string | null
          related_order_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_transactions_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author: string
          category: string
          content: string | null
          created_at: string
          excerpt: string | null
          id: string
          image_url: string | null
          is_featured: boolean
          is_published: boolean
          published_at: string | null
          read_time: string | null
          slug: string
          title: string
          updated_at: string
          views_count: number
        }
        Insert: {
          author?: string
          category?: string
          content?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_published?: boolean
          published_at?: string | null
          read_time?: string | null
          slug: string
          title: string
          updated_at?: string
          views_count?: number
        }
        Update: {
          author?: string
          category?: string
          content?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_published?: boolean
          published_at?: string | null
          read_time?: string | null
          slug?: string
          title?: string
          updated_at?: string
          views_count?: number
        }
        Relationships: []
      }
      chat_group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_group_messages: {
        Row: {
          content: string | null
          created_at: string
          group_id: string
          id: string
          sender_user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          group_id: string
          id?: string
          sender_user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          group_id?: string
          id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          course_id: string | null
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          course_id?: string | null
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          course_id?: string | null
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_notification_settings: {
        Row: {
          chat_partner_id: string | null
          chat_type: string
          created_at: string | null
          id: string
          muted: boolean | null
          notification_sound: string
          user_id: string
        }
        Insert: {
          chat_partner_id?: string | null
          chat_type: string
          created_at?: string | null
          id?: string
          muted?: boolean | null
          notification_sound?: string
          user_id: string
        }
        Update: {
          chat_partner_id?: string | null
          chat_type?: string
          created_at?: string | null
          id?: string
          muted?: boolean | null
          notification_sound?: string
          user_id?: string
        }
        Relationships: []
      }
      commercial_proposal_services: {
        Row: {
          custom_description: string | null
          custom_name: string
          id: string
          price: number
          proposal_id: string
          quantity: number
          service_id: string | null
          sort_order: number
        }
        Insert: {
          custom_description?: string | null
          custom_name: string
          id?: string
          price?: number
          proposal_id: string
          quantity?: number
          service_id?: string | null
          sort_order?: number
        }
        Update: {
          custom_description?: string | null
          custom_name?: string
          id?: string
          price?: number
          proposal_id?: string
          quantity?: number
          service_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "commercial_proposal_services_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "commercial_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_proposal_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "sales_services"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_proposals: {
        Row: {
          company_email: string | null
          company_inn: string | null
          company_name: string
          company_phone: string | null
          contact_person: string | null
          created_at: string
          created_by: string
          custom_note: string | null
          discount_percent: number | null
          id: string
          manager_id: string | null
          sender_email: string | null
          sender_name: string | null
          sender_website: string | null
          status: string
          tariff_plan: string | null
          total_amount: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          company_email?: string | null
          company_inn?: string | null
          company_name: string
          company_phone?: string | null
          contact_person?: string | null
          created_at?: string
          created_by: string
          custom_note?: string | null
          discount_percent?: number | null
          id?: string
          manager_id?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_website?: string | null
          status?: string
          tariff_plan?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          company_email?: string | null
          company_inn?: string | null
          company_name?: string
          company_phone?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string
          custom_note?: string | null
          discount_percent?: number | null
          id?: string
          manager_id?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_website?: string | null
          status?: string
          tariff_plan?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_proposals_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "sales_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          director: string | null
          email: string | null
          generated_password: string | null
          id: string
          inn: string | null
          kpp: string | null
          login_email: string | null
          name: string
          ogrn: string | null
          organization_id: string
          signature_url: string | null
          stamp_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          director?: string | null
          email?: string | null
          generated_password?: string | null
          id?: string
          inn?: string | null
          kpp?: string | null
          login_email?: string | null
          name: string
          ogrn?: string | null
          organization_id: string
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          director?: string | null
          email?: string | null
          generated_password?: string | null
          id?: string
          inn?: string | null
          kpp?: string | null
          login_email?: string | null
          name?: string
          ogrn?: string | null
          organization_id?: string
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      company_documents: {
        Row: {
          amount: number | null
          company_id: string
          contract_date: string | null
          contract_number: string | null
          course_id: string | null
          file_path: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_paid: boolean | null
          name: string
          paid_at: string | null
          students_count: number | null
          type: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          amount?: number | null
          company_id: string
          contract_date?: string | null
          contract_number?: string | null
          course_id?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_paid?: boolean | null
          name: string
          paid_at?: string | null
          students_count?: number | null
          type: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          amount?: number | null
          company_id?: string
          contract_date?: string | null
          contract_number?: string | null
          course_id?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_paid?: boolean | null
          name?: string
          paid_at?: string | null
          students_count?: number | null
          type?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      company_requests: {
        Row: {
          company_id: string
          course_id: string | null
          course_name: string | null
          created_at: string
          description: string | null
          desired_date: string | null
          employees: Json | null
          id: string
          org_response: string | null
          organization_id: string
          request_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          course_id?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          desired_date?: string | null
          employees?: Json | null
          id?: string
          org_response?: string | null
          organization_id: string
          request_type?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          course_id?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          desired_date?: string | null
          employees?: Json | null
          id?: string
          org_response?: string | null
          organization_id?: string
          request_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_requests_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_documents: {
        Row: {
          address: string | null
          company_address: string | null
          company_director: string | null
          company_inn: string | null
          company_name: string | null
          consent_type: string
          content_html: string
          created_at: string
          created_by: string | null
          full_name: string | null
          id: string
          organization_id: string
          passport_data: string | null
          student_user_id: string | null
        }
        Insert: {
          address?: string | null
          company_address?: string | null
          company_director?: string | null
          company_inn?: string | null
          company_name?: string | null
          consent_type: string
          content_html: string
          created_at?: string
          created_by?: string | null
          full_name?: string | null
          id?: string
          organization_id: string
          passport_data?: string | null
          student_user_id?: string | null
        }
        Update: {
          address?: string | null
          company_address?: string | null
          company_director?: string | null
          company_inn?: string | null
          company_name?: string | null
          consent_type?: string
          content_html?: string
          created_at?: string
          created_by?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string
          passport_data?: string | null
          student_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_access_log: {
        Row: {
          accessed_at: string | null
          course_id: string
          id: string
          ip_address: string | null
          organization_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accessed_at?: string | null
          course_id: string
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accessed_at?: string | null
          course_id?: string
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_access_log_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_access_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_achievements: {
        Row: {
          achievement_id: string
          course_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          achievement_id: string
          course_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          achievement_id?: string
          course_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_achievements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_categories: {
        Row: {
          color: string | null
          created_at: string
          hidden_from_catalog: boolean
          icon: string | null
          id: string
          name: string
          order_index: number | null
          organization_id: string
          parent_type: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          hidden_from_catalog?: boolean
          icon?: string | null
          id?: string
          name: string
          order_index?: number | null
          organization_id: string
          parent_type?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          hidden_from_catalog?: boolean
          icon?: string | null
          id?: string
          name?: string
          order_index?: number | null
          organization_id?: string
          parent_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_documents: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          file_url: string | null
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_documents_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_payments: {
        Row: {
          amount: number
          course_id: string
          created_at: string
          email: string | null
          id: string
          organization_id: string
          paid_at: string | null
          payment_method: string | null
          robokassa_inv_id: number | null
          status: string
          user_id: string | null
        }
        Insert: {
          amount: number
          course_id: string
          created_at?: string
          email?: string | null
          id?: string
          organization_id: string
          paid_at?: string | null
          payment_method?: string | null
          robokassa_inv_id?: number | null
          status?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          course_id?: string
          created_at?: string
          email?: string | null
          id?: string
          organization_id?: string
          paid_at?: string | null
          payment_method?: string | null
          robokassa_inv_id?: number | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_payments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_promo_codes: {
        Row: {
          code: string
          course_id: string
          created_at: string
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          used_count: number
          valid_until: string | null
        }
        Insert: {
          code: string
          course_id: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          used_count?: number
          valid_until?: string | null
        }
        Update: {
          code?: string
          course_id?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          used_count?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_promo_codes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_reminders: {
        Row: {
          company_id: string | null
          completed_at: string
          course_id: string
          created_at: string
          enrollment_id: string
          id: string
          is_dismissed: boolean
          is_sent: boolean
          notify_company: boolean
          notify_organization: boolean
          notify_student: boolean
          organization_id: string
          reminder_date: string
          reminder_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          completed_at: string
          course_id: string
          created_at?: string
          enrollment_id: string
          id?: string
          is_dismissed?: boolean
          is_sent?: boolean
          notify_company?: boolean
          notify_organization?: boolean
          notify_student?: boolean
          organization_id: string
          reminder_date: string
          reminder_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string
          course_id?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          is_dismissed?: boolean
          is_sent?: boolean
          notify_company?: boolean
          notify_organization?: boolean
          notify_student?: boolean
          organization_id?: string
          reminder_date?: string
          reminder_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_reminders_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_reminders_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_requests: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          organization_id: string | null
          status: string
          students_count: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string | null
          status?: string
          students_count?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string | null
          status?: string
          students_count?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          accent_color: string | null
          allow_materials_download: boolean
          allow_video_seek: boolean
          catalog_order: number
          category_id: string | null
          completion_notify_emails: string | null
          cover_image_url: string | null
          created_at: string
          default_access_days: number | null
          description: string | null
          duration: string | null
          frdo_document_type: string | null
          frdo_duration_hours: number | null
          frdo_education_form: string | null
          frdo_financing_source: string | null
          frdo_profession_name: string | null
          frdo_professional_area: string | null
          frdo_program_type: string | null
          frdo_qualification_name: string | null
          frdo_qualification_rank: string | null
          frdo_specialty_group: string | null
          hidden_from_catalog: boolean
          id: string
          is_published: boolean
          landing_content: Json | null
          notify_on_completion: boolean
          organization_id: string
          price: number
          reminder_advance_days: number
          require_enrollment_approval: boolean
          retraining_period_months: number | null
          sequential_lessons: boolean
          skip_video_identification: boolean | null
          slug: string | null
          source_course_id: string | null
          source_order_id: string | null
          title: string
          training_form: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          allow_materials_download?: boolean
          allow_video_seek?: boolean
          catalog_order?: number
          category_id?: string | null
          completion_notify_emails?: string | null
          cover_image_url?: string | null
          created_at?: string
          default_access_days?: number | null
          description?: string | null
          duration?: string | null
          frdo_document_type?: string | null
          frdo_duration_hours?: number | null
          frdo_education_form?: string | null
          frdo_financing_source?: string | null
          frdo_profession_name?: string | null
          frdo_professional_area?: string | null
          frdo_program_type?: string | null
          frdo_qualification_name?: string | null
          frdo_qualification_rank?: string | null
          frdo_specialty_group?: string | null
          hidden_from_catalog?: boolean
          id?: string
          is_published?: boolean
          landing_content?: Json | null
          notify_on_completion?: boolean
          organization_id: string
          price?: number
          reminder_advance_days?: number
          require_enrollment_approval?: boolean
          retraining_period_months?: number | null
          sequential_lessons?: boolean
          skip_video_identification?: boolean | null
          slug?: string | null
          source_course_id?: string | null
          source_order_id?: string | null
          title: string
          training_form?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          allow_materials_download?: boolean
          allow_video_seek?: boolean
          catalog_order?: number
          category_id?: string | null
          completion_notify_emails?: string | null
          cover_image_url?: string | null
          created_at?: string
          default_access_days?: number | null
          description?: string | null
          duration?: string | null
          frdo_document_type?: string | null
          frdo_duration_hours?: number | null
          frdo_education_form?: string | null
          frdo_financing_source?: string | null
          frdo_profession_name?: string | null
          frdo_professional_area?: string | null
          frdo_program_type?: string | null
          frdo_qualification_name?: string | null
          frdo_qualification_rank?: string | null
          frdo_specialty_group?: string | null
          hidden_from_catalog?: boolean
          id?: string
          is_published?: boolean
          landing_content?: Json | null
          notify_on_completion?: boolean
          organization_id?: string
          price?: number
          reminder_advance_days?: number
          require_enrollment_approval?: boolean
          retraining_period_months?: number | null
          sequential_lessons?: boolean
          skip_video_identification?: boolean | null
          slug?: string | null
          source_course_id?: string | null
          source_order_id?: string | null
          title?: string
          training_form?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_source_course_id_fkey"
            columns: ["source_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      document_issuance_log: {
        Row: {
          created_at: string
          document_name: string
          document_type: string
          enrollment_id: string | null
          file_url: string | null
          id: string
          issued_at: string
          organization_id: string
          reg_number: string | null
          send_method: string | null
          send_number: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          document_name: string
          document_type: string
          enrollment_id?: string | null
          file_url?: string | null
          id?: string
          issued_at?: string
          organization_id: string
          reg_number?: string | null
          send_method?: string | null
          send_number?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string
          document_name?: string
          document_type?: string
          enrollment_id?: string | null
          file_url?: string | null
          id?: string
          issued_at?: string
          organization_id?: string
          reg_number?: string | null
          send_method?: string | null
          send_number?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_issuance_log_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_issuance_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      education_document_records: {
        Row: {
          birth_date: string | null
          created_at: string
          delivery_details: string | null
          delivery_method: string
          document_number: string
          document_series: string | null
          document_status: string
          document_type: string
          enrollment_id: string | null
          full_name: string
          id: string
          issue_date: string
          notes: string | null
          order_date: string | null
          order_number: string | null
          organization_id: string
          original_document_data: string | null
          protocol_date: string | null
          protocol_number: string | null
          qualification_name: string | null
          reg_number: string
          specialty_name: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          delivery_details?: string | null
          delivery_method?: string
          document_number: string
          document_series?: string | null
          document_status?: string
          document_type: string
          enrollment_id?: string | null
          full_name: string
          id?: string
          issue_date: string
          notes?: string | null
          order_date?: string | null
          order_number?: string | null
          organization_id: string
          original_document_data?: string | null
          protocol_date?: string | null
          protocol_number?: string | null
          qualification_name?: string | null
          reg_number: string
          specialty_name: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          delivery_details?: string | null
          delivery_method?: string
          document_number?: string
          document_series?: string | null
          document_status?: string
          document_type?: string
          enrollment_id?: string | null
          full_name?: string
          id?: string
          issue_date?: string
          notes?: string | null
          order_date?: string | null
          order_number?: string | null
          organization_id?: string
          original_document_data?: string | null
          protocol_date?: string | null
          protocol_number?: string | null
          qualification_name?: string | null
          reg_number?: string
          specialty_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "education_document_records_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "education_document_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_action_tokens: {
        Row: {
          action_type: string
          created_at: string
          id: string
          organization_email: string
          organization_id: string
          template_name: string
          used: boolean
          used_at: string | null
        }
        Insert: {
          action_type?: string
          created_at?: string
          id?: string
          organization_email: string
          organization_id: string
          template_name?: string
          used?: boolean
          used_at?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          organization_email?: string
          organization_id?: string
          template_name?: string
          used?: boolean
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_action_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_history: {
        Row: {
          action: string
          course_id: string
          created_at: string
          enrollment_id: string | null
          id: string
          performed_by: string | null
          user_id: string
        }
        Insert: {
          action: string
          course_id: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          performed_by?: string | null
          user_id: string
        }
        Update: {
          action?: string
          course_id?: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          performed_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_history_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_requests: {
        Row: {
          course_id: string
          created_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_requests_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          access_days: number | null
          completed_at: string | null
          course_id: string
          expires_at: string | null
          id: string
          progress: number
          started_at: string
          status: string
          time_spent: number
          user_id: string
        }
        Insert: {
          access_days?: number | null
          completed_at?: string | null
          course_id: string
          expires_at?: string | null
          id?: string
          progress?: number
          started_at?: string
          status?: string
          time_spent?: number
          user_id: string
        }
        Update: {
          access_days?: number | null
          completed_at?: string | null
          course_id?: string
          expires_at?: string | null
          id?: string
          progress?: number
          started_at?: string
          status?: string
          time_spent?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_history: {
        Row: {
          action: string
          course_id: string | null
          course_title: string
          created_at: string | null
          details: string | null
          duration_ms: number | null
          id: string
          items_count: number | null
          stream_index: number | null
        }
        Insert: {
          action: string
          course_id?: string | null
          course_title: string
          created_at?: string | null
          details?: string | null
          duration_ms?: number | null
          id?: string
          items_count?: number | null
          stream_index?: number | null
        }
        Update: {
          action?: string
          course_id?: string | null
          course_title?: string
          created_at?: string | null
          details?: string | null
          duration_ms?: number | null
          id?: string
          items_count?: number | null
          stream_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_history_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submissions: {
        Row: {
          attachments: Json | null
          content: string | null
          course_id: string
          created_at: string
          id: string
          lesson_id: string
          organization_id: string
          reviewed_at: string | null
          reviewer_comment: string | null
          reviewer_id: string | null
          score: number | null
          status: string
          student_id: string
          submitted_at: string
        }
        Insert: {
          attachments?: Json | null
          content?: string | null
          course_id: string
          created_at?: string
          id?: string
          lesson_id: string
          organization_id: string
          reviewed_at?: string | null
          reviewer_comment?: string | null
          reviewer_id?: string | null
          score?: number | null
          status?: string
          student_id: string
          submitted_at?: string
        }
        Update: {
          attachments?: Json | null
          content?: string | null
          course_id?: string
          created_at?: string
          id?: string
          lesson_id?: string
          organization_id?: string
          reviewed_at?: string | null
          reviewer_comment?: string | null
          reviewer_id?: string | null
          score?: number | null
          status?: string
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          entry_date: string
          entry_type: string
          id: string
          journal_id: string
          notes: string | null
          updated_at: string
          user_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          entry_date?: string
          entry_type?: string
          id?: string
          journal_id: string
          notes?: string | null
          updated_at?: string
          user_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          entry_date?: string
          entry_type?: string
          id?: string
          journal_id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_instances: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          journal_type: string
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          journal_type: string
          organization_id: string
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          journal_type?: string
          organization_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_instances_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_bank: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          organization_id: string | null
          source_filename: string | null
          tags: string[] | null
          title: string
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          source_filename?: string | null
          tags?: string[] | null
          title: string
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          source_filename?: string | null
          tags?: string[] | null
          title?: string
        }
        Relationships: []
      }
      labor_safety_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_safety_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_safety_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          generated_password: string | null
          id: string
          login: string | null
          organization_id: string
          record_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          generated_password?: string | null
          id?: string
          login?: string | null
          organization_id: string
          record_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          generated_password?: string | null
          id?: string
          login?: string | null
          organization_id?: string
          record_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_safety_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_safety_profiles_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: true
            referencedRelation: "labor_safety_records"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_safety_records: {
        Row: {
          created_at: string
          exam_date: string | null
          full_name: string
          group_id: string
          id: string
          inn: string | null
          is_passed: boolean | null
          organization_name: string | null
          position: string | null
          program_name: string | null
          protocol_number: string | null
          snils: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_date?: string | null
          full_name: string
          group_id: string
          id?: string
          inn?: string | null
          is_passed?: boolean | null
          organization_name?: string | null
          position?: string | null
          program_name?: string | null
          protocol_number?: string | null
          snils?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_date?: string | null
          full_name?: string
          group_id?: string
          id?: string
          inn?: string | null
          is_passed?: boolean | null
          organization_name?: string | null
          position?: string | null
          program_name?: string | null
          protocol_number?: string | null
          snils?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_safety_records_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "labor_safety_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_content: {
        Row: {
          content_key: string
          content_value: string
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          content_key: string
          content_value: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content_key?: string
          content_value?: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      lesson_attachments: {
        Row: {
          category: string
          created_at: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          lesson_id: string
          name: string
          order_index: number
        }
        Insert: {
          category?: string
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          lesson_id: string
          name: string
          order_index?: number
        }
        Update: {
          category?: string
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          lesson_id?: string
          name?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_attachments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          id: string
          lesson_id: string
          time_spent: number
          user_id: string
          video_duration: number | null
          video_position: number | null
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id: string
          time_spent?: number
          user_id: string
          video_duration?: number | null
          video_position?: number | null
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id?: string
          time_spent?: number
          user_id?: string
          video_duration?: number | null
          video_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          course_id: string
          created_at: string
          id: string
          is_locked: boolean
          order_index: number
          test_passing_score: number
          test_questions_count: number | null
          test_questions_to_show: number | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          course_id: string
          created_at?: string
          id?: string
          is_locked?: boolean
          order_index?: number
          test_passing_score?: number
          test_questions_count?: number | null
          test_questions_to_show?: number | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          course_id?: string
          created_at?: string
          id?: string
          is_locked?: boolean
          order_index?: number
          test_passing_score?: number
          test_questions_count?: number | null
          test_questions_to_show?: number | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      library_documents: {
        Row: {
          created_at: string
          description: string | null
          file_size: number | null
          file_url: string | null
          folder_id: string | null
          id: string
          name: string
          organization_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_url?: string | null
          folder_id?: string | null
          id?: string
          name: string
          organization_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_url?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "library_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      library_folders: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "library_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_course_comments: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          marketplace_course_id: string
          user_id: string | null
        }
        Insert: {
          author_name?: string
          content: string
          created_at?: string
          id?: string
          marketplace_course_id: string
          user_id?: string | null
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          marketplace_course_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_course_comments_marketplace_course_id_fkey"
            columns: ["marketplace_course_id"]
            isOneToOne: false
            referencedRelation: "marketplace_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_courses: {
        Row: {
          course_id: string
          created_at: string
          description_short: string | null
          id: string
          is_active: boolean
          is_validated: boolean
          organization_id: string | null
          preview_image_url: string | null
          price_organization: number
          price_student: number
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description_short?: string | null
          id?: string
          is_active?: boolean
          is_validated?: boolean
          organization_id?: string | null
          preview_image_url?: string | null
          price_organization?: number
          price_student?: number
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description_short?: string | null
          id?: string
          is_active?: boolean
          is_validated?: boolean
          organization_id?: string | null
          preview_image_url?: string | null
          price_organization?: number
          price_student?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_orders: {
        Row: {
          buyer_organization_id: string | null
          buyer_type: string
          buyer_user_id: string | null
          created_at: string
          id: string
          marketplace_course_id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          price: number
          status: string
          students_count: number | null
          updated_at: string
        }
        Insert: {
          buyer_organization_id?: string | null
          buyer_type: string
          buyer_user_id?: string | null
          created_at?: string
          id?: string
          marketplace_course_id: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          price: number
          status?: string
          students_count?: number | null
          updated_at?: string
        }
        Update: {
          buyer_organization_id?: string | null
          buyer_type?: string
          buyer_user_id?: string | null
          created_at?: string
          id?: string
          marketplace_course_id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          price?: number
          status?: string
          students_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_buyer_organization_id_fkey"
            columns: ["buyer_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_marketplace_course_id_fkey"
            columns: ["marketplace_course_id"]
            isOneToOne: false
            referencedRelation: "marketplace_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          is_active: boolean
          source: string | null
          subscribed_at: string
        }
        Insert: {
          email: string
          id?: string
          is_active?: boolean
          source?: string | null
          subscribed_at?: string
        }
        Update: {
          email?: string
          id?: string
          is_active?: boolean
          source?: string | null
          subscribed_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          channel: string
          created_at: string
          enabled: boolean
          id: string
          notification_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      org_billing_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_url: string
          id: string
          name: string
          organization_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string
          file_url: string
          id?: string
          name: string
          organization_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_url?: string
          id?: string
          name?: string
          organization_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_billing_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_contracts: {
        Row: {
          contract_date: string | null
          contract_number: string | null
          created_at: string
          file_path: string | null
          file_url: string | null
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          contract_date?: string | null
          contract_number?: string | null
          created_at?: string
          file_path?: string | null
          file_url?: string | null
          id?: string
          name?: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          contract_date?: string | null
          contract_number?: string | null
          created_at?: string
          file_path?: string | null
          file_url?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_documents: {
        Row: {
          created_at: string
          file_url: string | null
          id: string
          name: string
          organization_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          id?: string
          name: string
          organization_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_url?: string | null
          id?: string
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_general_messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          content: string | null
          created_at: string
          id: string
          organization_id: string
          sender_user_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          organization_id: string
          sender_user_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_general_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          organization_id: string
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          organization_id: string
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          organization_id?: string
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_payers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          inn: string | null
          name: string
          organization_id: string
          payer_type: Database["public"]["Enums"]["payer_type"]
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          inn?: string | null
          name: string
          organization_id: string
          payer_type?: Database["public"]["Enums"]["payer_type"]
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          inn?: string | null
          name?: string
          organization_id?: string
          payer_type?: Database["public"]["Enums"]["payer_type"]
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_payers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_staff: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          id: string
          organization_id: string
          role: string
          sections_access: Json | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          organization_id: string
          role?: string
          sections_access?: Json | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          organization_id?: string
          role?: string
          sections_access?: Json | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_student_messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          content: string | null
          created_at: string
          id: string
          is_read: boolean
          organization_id: string
          sender_user_id: string
          student_user_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          organization_id: string
          sender_user_id: string
          student_user_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          organization_id?: string
          sender_user_id?: string
          student_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_student_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_comments: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_credentials: {
        Row: {
          created_at: string
          id: string
          login_email: string
          login_password: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          login_email: string
          login_password: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          login_email?: string
          login_password?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_feature_categories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_enabled: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_feature_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_feature_usage: {
        Row: {
          created_at: string
          feature_id: string
          id: string
          last_used_at: string
          organization_id: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          feature_id: string
          id?: string
          last_used_at?: string
          organization_id: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          feature_id?: string
          id?: string
          last_used_at?: string
          organization_id?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_feature_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_features: {
        Row: {
          category_id: string
          created_at: string
          feature_id: string
          id: string
          is_enabled: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          feature_id: string
          id?: string
          is_enabled?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          feature_id?: string
          id?: string
          is_enabled?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_features_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_offer_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip_address: string | null
          offer_version: string | null
          organization_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          offer_version?: string | null
          organization_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          offer_version?: string | null
          organization_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_offer_acceptances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_payment_settings: {
        Row: {
          created_at: string
          id: string
          is_test_mode: boolean
          merchant_login: string
          organization_id: string
          password1_encrypted: string
          password2_encrypted: string
          payment_mode: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_test_mode?: boolean
          merchant_login?: string
          organization_id: string
          password1_encrypted?: string
          password2_encrypted?: string
          payment_mode?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_test_mode?: boolean
          merchant_login?: string
          organization_id?: string
          password1_encrypted?: string
          password2_encrypted?: string
          payment_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_payment_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_reminders: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_completed: boolean
          organization_id: string
          reminder_date: string
          send_email: boolean
          telegram_chat_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_completed?: boolean
          organization_id: string
          reminder_date: string
          send_email?: boolean
          telegram_chat_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_completed?: boolean
          organization_id?: string
          reminder_date?: string
          send_email?: boolean
          telegram_chat_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_usage: {
        Row: {
          ai_generations_count: number
          ai_tokens_used: number
          created_at: string
          id: string
          month_start: string
          organization_id: string
          storage_bytes: number
          updated_at: string
        }
        Insert: {
          ai_generations_count?: number
          ai_tokens_used?: number
          created_at?: string
          id?: string
          month_start?: string
          organization_id: string
          storage_bytes?: number
          updated_at?: string
        }
        Update: {
          ai_generations_count?: number
          ai_tokens_used?: number
          created_at?: string
          id?: string
          month_start?: string
          organization_id?: string
          storage_bytes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          actual_address: string | null
          ai_enabled: boolean
          ai_provider: string
          ai_tokens_limit: number
          balance: number
          bank_account: string | null
          bank_bik: string | null
          bank_corr_account: string | null
          bank_name: string | null
          branding: Json | null
          contact_name: string | null
          created_at: string
          custom_ai_generations_limit: number | null
          custom_discount: number | null
          custom_enabled_categories: string[] | null
          custom_max_courses: number | null
          custom_max_students: number | null
          custom_max_trained_per_month: number | null
          custom_price: number | null
          custom_storage_limit_bytes: number | null
          description: string | null
          director_gender: string | null
          director_name: string | null
          director_position: string | null
          email: string
          enabled_features: Json | null
          frdo_enabled: boolean
          id: string
          inn: string | null
          is_paid: boolean
          kpp: string | null
          legal_address: string | null
          login_branding: Json | null
          login_slug: string | null
          menu_settings: Json | null
          monthly_price: number | null
          name: string
          notify_on_limit_80: boolean
          notify_on_limit_exceeded: boolean
          ogrn: string | null
          paid_until: string | null
          phone: string | null
          promo_code: string | null
          signature_url: string | null
          stamp_url: string | null
          storage_limit_bytes: number
          student_dashboard_settings: Json | null
          subscription_plan: string
          tariff_custom_label: string | null
          tariff_type: string | null
          telegram_chat_id: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          actual_address?: string | null
          ai_enabled?: boolean
          ai_provider?: string
          ai_tokens_limit?: number
          balance?: number
          bank_account?: string | null
          bank_bik?: string | null
          bank_corr_account?: string | null
          bank_name?: string | null
          branding?: Json | null
          contact_name?: string | null
          created_at?: string
          custom_ai_generations_limit?: number | null
          custom_discount?: number | null
          custom_enabled_categories?: string[] | null
          custom_max_courses?: number | null
          custom_max_students?: number | null
          custom_max_trained_per_month?: number | null
          custom_price?: number | null
          custom_storage_limit_bytes?: number | null
          description?: string | null
          director_gender?: string | null
          director_name?: string | null
          director_position?: string | null
          email: string
          enabled_features?: Json | null
          frdo_enabled?: boolean
          id?: string
          inn?: string | null
          is_paid?: boolean
          kpp?: string | null
          legal_address?: string | null
          login_branding?: Json | null
          login_slug?: string | null
          menu_settings?: Json | null
          monthly_price?: number | null
          name: string
          notify_on_limit_80?: boolean
          notify_on_limit_exceeded?: boolean
          ogrn?: string | null
          paid_until?: string | null
          phone?: string | null
          promo_code?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          storage_limit_bytes?: number
          student_dashboard_settings?: Json | null
          subscription_plan?: string
          tariff_custom_label?: string | null
          tariff_type?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          actual_address?: string | null
          ai_enabled?: boolean
          ai_provider?: string
          ai_tokens_limit?: number
          balance?: number
          bank_account?: string | null
          bank_bik?: string | null
          bank_corr_account?: string | null
          bank_name?: string | null
          branding?: Json | null
          contact_name?: string | null
          created_at?: string
          custom_ai_generations_limit?: number | null
          custom_discount?: number | null
          custom_enabled_categories?: string[] | null
          custom_max_courses?: number | null
          custom_max_students?: number | null
          custom_max_trained_per_month?: number | null
          custom_price?: number | null
          custom_storage_limit_bytes?: number | null
          description?: string | null
          director_gender?: string | null
          director_name?: string | null
          director_position?: string | null
          email?: string
          enabled_features?: Json | null
          frdo_enabled?: boolean
          id?: string
          inn?: string | null
          is_paid?: boolean
          kpp?: string | null
          legal_address?: string | null
          login_branding?: Json | null
          login_slug?: string | null
          menu_settings?: Json | null
          monthly_price?: number | null
          name?: string
          notify_on_limit_80?: boolean
          notify_on_limit_exceeded?: boolean
          ogrn?: string | null
          paid_until?: string | null
          phone?: string | null
          promo_code?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          storage_limit_bytes?: number
          student_dashboard_settings?: Json | null
          subscription_plan?: string
          tariff_custom_label?: string | null
          tariff_type?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      partner_applications: {
        Row: {
          comment: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          inn: string | null
          organization_id: string | null
          phone: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          inn?: string | null
          organization_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          inn?: string | null
          organization_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_monthly_stats: {
        Row: {
          created_at: string
          direct_revenue: number
          id: string
          is_top: boolean
          month: string
          network_revenue: number
          partner_id: string
          rank: number | null
          total_commission: number
        }
        Insert: {
          created_at?: string
          direct_revenue?: number
          id?: string
          is_top?: boolean
          month: string
          network_revenue?: number
          partner_id: string
          rank?: number | null
          total_commission?: number
        }
        Update: {
          created_at?: string
          direct_revenue?: number
          id?: string
          is_top?: boolean
          month?: string
          network_revenue?: number
          partner_id?: string
          rank?: number | null
          total_commission?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_monthly_stats_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_enrollments: {
        Row: {
          course_id: string | null
          course_title: string
          created_at: string
          id: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          course_title: string
          created_at?: string
          id?: string
          organization_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string | null
          course_title?: string
          created_at?: string
          id?: string
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_enrollments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          completed_log: Json
          course_ids: Json
          created_at: string | null
          current_index: number
          current_phase: string | null
          enable_verification: boolean | null
          id: string
          prompts: Json | null
          status: string
          summary: Json | null
          total_courses: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_log?: Json
          course_ids?: Json
          created_at?: string | null
          current_index?: number
          current_phase?: string | null
          enable_verification?: boolean | null
          id?: string
          prompts?: Json | null
          status?: string
          summary?: Json | null
          total_courses?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_log?: Json
          course_ids?: Json
          created_at?: string | null
          current_index?: number
          current_phase?: string | null
          enable_verification?: boolean | null
          id?: string
          prompts?: Json | null
          status?: string
          summary?: Json | null
          total_courses?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plan_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          plan: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone: string
          plan: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          plan?: string
          status?: string
        }
        Relationships: []
      }
      platform_announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          title: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string | null
        }
        Relationships: []
      }
      platform_updates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          image_url: string | null
          is_published: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          generated_password: string | null
          id: string
          last_visit_at: string | null
          login: string | null
          onboarding_completed: boolean
          organization_id: string | null
          phone: string | null
          student_group_id: string | null
          telegram_link: string | null
          updated_at: string
          user_id: string
          vk_link: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          generated_password?: string | null
          id?: string
          last_visit_at?: string | null
          login?: string | null
          onboarding_completed?: boolean
          organization_id?: string | null
          phone?: string | null
          student_group_id?: string | null
          telegram_link?: string | null
          updated_at?: string
          user_id: string
          vk_link?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          generated_password?: string | null
          id?: string
          last_visit_at?: string | null
          login?: string | null
          onboarding_completed?: boolean
          organization_id?: string | null
          phone?: string | null
          student_group_id?: string | null
          telegram_link?: string | null
          updated_at?: string
          user_id?: string
          vk_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_student_group_id_fkey"
            columns: ["student_group_id"]
            isOneToOne: false
            referencedRelation: "student_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      program_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      program_documents: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          folder_id: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          folder_id?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "program_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "program_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      program_folders: {
        Row: {
          category_id: string | null
          color: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
        }
        Insert: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
        }
        Update: {
          category_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_folders_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "program_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "program_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string | null
          discount_percent: number
          id: string
          is_active: boolean | null
          max_uses: number | null
          used_count: number | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          discount_percent: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          used_count?: number | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          discount_percent?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          used_count?: number | null
          valid_until?: string | null
        }
        Relationships: []
      }
      radio_stations: {
        Row: {
          created_at: string
          genre: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          radioapi_stream_id: number | null
          sort_order: number | null
          stream_url: string
        }
        Insert: {
          created_at?: string
          genre?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          radioapi_stream_id?: number | null
          sort_order?: number | null
          stream_url: string
        }
        Update: {
          created_at?: string
          genre?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          radioapi_stream_id?: number | null
          sort_order?: number | null
          stream_url?: string
        }
        Relationships: []
      }
      referral_commissions: {
        Row: {
          amount: number
          bonus_type: string | null
          commission_amount: number
          created_at: string
          id: string
          level: number
          organization_id: string
          partner_id: string
          payment_source: string
          source_partner_id: string | null
          status: string
        }
        Insert: {
          amount: number
          bonus_type?: string | null
          commission_amount: number
          created_at?: string
          id?: string
          level?: number
          organization_id: string
          partner_id: string
          payment_source?: string
          source_partner_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          bonus_type?: string | null
          commission_amount?: number
          created_at?: string
          id?: string
          level?: number
          organization_id?: string
          partner_id?: string
          payment_source?: string
          source_partner_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_commissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_source_partner_id_fkey"
            columns: ["source_partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_partners: {
        Row: {
          balance: number
          bank_details: string | null
          code: string
          commission_percent: number
          created_at: string
          has_turnover_bonus: boolean
          id: string
          is_top_partner: boolean
          level1_percent: number
          level2_percent: number
          level3_percent: number
          monthly_network_revenue: number
          referred_by_partner_id: string | null
          status: string
          total_earned: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          bank_details?: string | null
          code: string
          commission_percent?: number
          created_at?: string
          has_turnover_bonus?: boolean
          id?: string
          is_top_partner?: boolean
          level1_percent?: number
          level2_percent?: number
          level3_percent?: number
          monthly_network_revenue?: number
          referred_by_partner_id?: string | null
          status?: string
          total_earned?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          bank_details?: string | null
          code?: string
          commission_percent?: number
          created_at?: string
          has_turnover_bonus?: boolean
          id?: string
          is_top_partner?: boolean
          level1_percent?: number
          level2_percent?: number
          level3_percent?: number
          monthly_network_revenue?: number
          referred_by_partner_id?: string | null
          status?: string
          total_earned?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_partners_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_payouts: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_at: string | null
          partner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_promo_materials: {
        Row: {
          created_at: string
          description: string | null
          html_code: string | null
          id: string
          image_url: string | null
          is_active: boolean
          size: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          html_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          size?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          html_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          size?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      referral_registrations: {
        Row: {
          expires_at: string
          id: string
          organization_id: string
          partner_id: string
          registered_at: string
        }
        Insert: {
          expires_at?: string
          id?: string
          organization_id: string
          partner_id: string
          registered_at?: string
        }
        Update: {
          expires_at?: string
          id?: string
          organization_id?: string
          partner_id?: string
          registered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_registrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_registrations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_links: {
        Row: {
          company_id: string | null
          course_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          inn: string | null
          name: string | null
          organization_id: string
          student_group_id: string | null
          token: string
          used_count: number
        }
        Insert: {
          company_id?: string | null
          course_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inn?: string | null
          name?: string | null
          organization_id: string
          student_group_id?: string | null
          token: string
          used_count?: number
        }
        Update: {
          company_id?: string | null
          course_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inn?: string | null
          name?: string | null
          organization_id?: string
          student_group_id?: string | null
          token?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "registration_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_links_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_links_student_group_id_fkey"
            columns: ["student_group_id"]
            isOneToOne: false
            referencedRelation: "student_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_contracts: {
        Row: {
          company_address: string | null
          company_director: string | null
          company_inn: string | null
          company_kpp: string | null
          company_name: string
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          contract_date: string | null
          contract_duration_months: number
          contract_number: string | null
          created_at: string
          custom_services: Json | null
          html_content: string | null
          id: string
          manager_id: string | null
          notes: string | null
          prepayment_amount: number
          status: string
          tariff_plan: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          company_address?: string | null
          company_director?: string | null
          company_inn?: string | null
          company_kpp?: string | null
          company_name: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contract_date?: string | null
          contract_duration_months?: number
          contract_number?: string | null
          created_at?: string
          custom_services?: Json | null
          html_content?: string | null
          id?: string
          manager_id?: string | null
          notes?: string | null
          prepayment_amount?: number
          status?: string
          tariff_plan?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          company_address?: string | null
          company_director?: string | null
          company_inn?: string | null
          company_kpp?: string | null
          company_name?: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contract_date?: string | null
          contract_duration_months?: number
          contract_number?: string | null
          created_at?: string
          custom_services?: Json | null
          html_content?: string | null
          id?: string
          manager_id?: string | null
          notes?: string | null
          prepayment_amount?: number
          status?: string
          tariff_plan?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_contracts_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "sales_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_lead_activities: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          id: string
          lead_id: string
          manager_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id: string
          manager_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string
          manager_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_lead_activities_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "sales_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_leads: {
        Row: {
          address: string | null
          assigned_manager_id: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          inn: string | null
          last_contact_at: string | null
          license_date: string | null
          license_number: string | null
          notes: string | null
          ogrn: string | null
          org_name: string
          phone: string | null
          region: string | null
          source: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          assigned_manager_id?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          inn?: string | null
          last_contact_at?: string | null
          license_date?: string | null
          license_number?: string | null
          notes?: string | null
          ogrn?: string | null
          org_name: string
          phone?: string | null
          region?: string | null
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          assigned_manager_id?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          inn?: string | null
          last_contact_at?: string | null
          license_date?: string | null
          license_number?: string | null
          notes?: string | null
          ogrn?: string | null
          org_name?: string
          phone?: string | null
          region?: string | null
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_leads_assigned_manager_id_fkey"
            columns: ["assigned_manager_id"]
            isOneToOne: false
            referencedRelation: "sales_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_managers: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sales_services: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      service_orders: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          service_id: string
          service_price: string
          service_title: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          service_id: string
          service_price: string
          service_title: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          service_id?: string
          service_price?: string
          service_title?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      skillspace_import_jobs: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          login: string
          organization_id: string
          password: string
          result: Json | null
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          login: string
          organization_id: string
          password: string
          result?: Json | null
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          login?: string
          organization_id?: string
          password?: string
          result?: Json | null
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "skillspace_import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      student_consents: {
        Row: {
          address: string | null
          consent_type: string
          created_at: string
          email: string | null
          enrollment_id: string | null
          expires_at: string | null
          full_name: string | null
          id: string
          ip_address: string | null
          organization_id: string
          passport_data: string | null
          phone: string | null
          signed_at: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          consent_type: string
          created_at?: string
          email?: string | null
          enrollment_id?: string | null
          expires_at?: string | null
          full_name?: string | null
          id?: string
          ip_address?: string | null
          organization_id: string
          passport_data?: string | null
          phone?: string | null
          signed_at?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          consent_type?: string
          created_at?: string
          email?: string | null
          enrollment_id?: string | null
          expires_at?: string | null
          full_name?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string
          passport_data?: string | null
          phone?: string | null
          signed_at?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_consents_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      student_documents: {
        Row: {
          created_at: string
          enrollment_id: string
          file_url: string | null
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          file_url?: string | null
          id?: string
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          file_url?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_documents_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      student_frdo_data: {
        Row: {
          birth_date: string | null
          citizenship_code: string | null
          created_at: string
          education_doc_last_name: string | null
          education_doc_number: string | null
          education_doc_series: string | null
          education_form: string | null
          education_level: string | null
          financing_source: string | null
          first_name: string | null
          gender: string | null
          id: string
          last_name: string | null
          middle_name: string | null
          organization_id: string
          profession_name: string | null
          professional_area: string | null
          qualification_name: string | null
          qualification_rank: string | null
          snils: string | null
          specialty_group: string | null
          training_form: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          citizenship_code?: string | null
          created_at?: string
          education_doc_last_name?: string | null
          education_doc_number?: string | null
          education_doc_series?: string | null
          education_form?: string | null
          education_level?: string | null
          financing_source?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          organization_id: string
          profession_name?: string | null
          professional_area?: string | null
          qualification_name?: string | null
          qualification_rank?: string | null
          snils?: string | null
          specialty_group?: string | null
          training_form?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string | null
          citizenship_code?: string | null
          created_at?: string
          education_doc_last_name?: string | null
          education_doc_number?: string | null
          education_doc_series?: string | null
          education_form?: string | null
          education_level?: string | null
          financing_source?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          middle_name?: string | null
          organization_id?: string
          profession_name?: string | null
          professional_area?: string | null
          qualification_name?: string | null
          qualification_rank?: string | null
          snils?: string | null
          specialty_group?: string | null
          training_form?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_groups: {
        Row: {
          block_resubmit: boolean
          block_student_dialogs: boolean
          color: string | null
          created_at: string
          curator_id: string | null
          enable_channel: boolean
          enable_group_chat: boolean
          end_date: string | null
          id: string
          limit_access_time: boolean
          max_seats: number | null
          name: string
          organization_id: string
          schedule_access: boolean
          show_locked_lessons: boolean
          start_date: string | null
          strict_order: boolean
          updated_at: string
        }
        Insert: {
          block_resubmit?: boolean
          block_student_dialogs?: boolean
          color?: string | null
          created_at?: string
          curator_id?: string | null
          enable_channel?: boolean
          enable_group_chat?: boolean
          end_date?: string | null
          id?: string
          limit_access_time?: boolean
          max_seats?: number | null
          name: string
          organization_id: string
          schedule_access?: boolean
          show_locked_lessons?: boolean
          start_date?: string | null
          strict_order?: boolean
          updated_at?: string
        }
        Update: {
          block_resubmit?: boolean
          block_student_dialogs?: boolean
          color?: string | null
          created_at?: string
          curator_id?: string | null
          enable_channel?: boolean
          enable_group_chat?: boolean
          end_date?: string | null
          id?: string
          limit_access_time?: boolean
          max_seats?: number | null
          name?: string
          organization_id?: string
          schedule_access?: boolean
          show_locked_lessons?: boolean
          start_date?: string | null
          strict_order?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      student_identity_documents: {
        Row: {
          created_at: string
          file_path: string | null
          file_url: string | null
          id: string
          name: string
          organization_id: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          file_url?: string | null
          id?: string
          name: string
          organization_id: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string | null
          file_url?: string | null
          id?: string
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_login_history: {
        Row: {
          id: string
          ip_address: string | null
          logged_in_at: string
          organization_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          logged_in_at?: string
          organization_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          logged_in_at?: string
          organization_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_login_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount: number
          buyer_inn: string | null
          buyer_kpp: string | null
          buyer_name: string | null
          created_at: string | null
          id: string
          invoice_date: string
          invoice_number: string
          organization_id: string
          paid_at: string | null
          payment_id: string | null
          payment_method: string | null
          period_months: number
          plan: string
          status: string
        }
        Insert: {
          amount: number
          buyer_inn?: string | null
          buyer_kpp?: string | null
          buyer_name?: string | null
          created_at?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          organization_id: string
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          period_months?: number
          plan: string
          status?: string
        }
        Update: {
          amount?: number
          buyer_inn?: string | null
          buyer_kpp?: string | null
          buyer_name?: string | null
          created_at?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          organization_id?: string
          paid_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          period_months?: number
          plan?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_requests: {
        Row: {
          created_at: string
          current_plan: string
          id: string
          message: string | null
          organization_id: string
          processed_at: string | null
          processed_by: string | null
          requested_plan: string
          status: string
        }
        Insert: {
          created_at?: string
          current_plan: string
          id?: string
          message?: string | null
          organization_id: string
          processed_at?: string | null
          processed_by?: string | null
          requested_plan: string
          status?: string
        }
        Update: {
          created_at?: string
          current_plan?: string
          id?: string
          message?: string | null
          organization_id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_plan?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          admin_notes: string | null
          browser_info: string | null
          contact_phone: string | null
          created_at: string
          description: string
          error_logs: string | null
          id: string
          organization_id: string | null
          page_url: string | null
          screenshot_url: string | null
          status: string
          updated_at: string
          user_email: string | null
          user_id: string
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          admin_notes?: string | null
          browser_info?: string | null
          contact_phone?: string | null
          created_at?: string
          description: string
          error_logs?: string | null
          id?: string
          organization_id?: string | null
          page_url?: string | null
          screenshot_url?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          admin_notes?: string | null
          browser_info?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string
          error_logs?: string | null
          id?: string
          organization_id?: string | null
          page_url?: string | null
          screenshot_url?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      system_diagnostics: {
        Row: {
          check_name: string
          check_type: string
          details: Json | null
          executed_at: string
          executed_by: string | null
          id: string
          message: string | null
          organization_id: string
          status: string
        }
        Insert: {
          check_name: string
          check_type: string
          details?: Json | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          message?: string | null
          organization_id: string
          status: string
        }
        Update: {
          check_name?: string
          check_type?: string
          details?: Json | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          message?: string | null
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_diagnostics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_feature_categories: {
        Row: {
          base_price: number
          category_id: string
          created_at: string
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          base_price?: number
          category_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          base_price?: number
          category_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      system_features: {
        Row: {
          category_id: string
          created_at: string
          feature_id: string
          id: string
          is_enabled: boolean
          price: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          feature_id: string
          id?: string
          is_enabled?: boolean
          price?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          feature_id?: string
          id?: string
          is_enabled?: boolean
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      system_patches: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          description: string | null
          id: string
          is_applied: boolean
          migrations: Json | null
          name: string
          patch_data: Json
          patch_type: string
          source_project_url: string | null
          version: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_applied?: boolean
          migrations?: Json | null
          name: string
          patch_data: Json
          patch_type?: string
          source_project_url?: string | null
          version: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_applied?: boolean
          migrations?: Json | null
          name?: string
          patch_data?: Json
          patch_type?: string
          source_project_url?: string | null
          version?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      test_attempts: {
        Row: {
          answers: Json
          completed_at: string
          id: string
          lesson_id: string
          max_score: number
          score: number
          shown_question_ids: Json | null
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string
          id?: string
          lesson_id: string
          max_score?: number
          score?: number
          shown_question_ids?: Json | null
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string
          id?: string
          lesson_id?: string
          max_score?: number
          score?: number
          shown_question_ids?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      test_questions: {
        Row: {
          correct_answer: number | null
          explanation: string | null
          id: string
          image_url: string | null
          is_bank_question: boolean
          lesson_id: string
          options: Json
          order_index: number
          question: string
        }
        Insert: {
          correct_answer?: number | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          is_bank_question?: boolean
          lesson_id: string
          options?: Json
          order_index?: number
          question: string
        }
        Update: {
          correct_answer?: number | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          is_bank_question?: boolean
          lesson_id?: string
          options?: Json
          order_index?: number
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          author_name: string
          author_role: string | null
          content: string
          created_at: string
          highlight: string | null
          id: string
          is_approved: boolean
          organization_id: string
          rating: number
          user_id: string
        }
        Insert: {
          author_name: string
          author_role?: string | null
          content: string
          created_at?: string
          highlight?: string | null
          id?: string
          is_approved?: boolean
          organization_id: string
          rating?: number
          user_id: string
        }
        Update: {
          author_name?: string
          author_role?: string | null
          content?: string
          created_at?: string
          highlight?: string | null
          id?: string
          is_approved?: boolean
          organization_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          company_id: string
          course_id: string | null
          course_name: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          planned_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          course_id?: string | null
          course_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          planned_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          course_id?: string | null
          course_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          planned_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string
          id: string
          is_seen: boolean | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string
          id?: string
          is_seen?: boolean | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string
          id?: string
          is_seen?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_identifications: {
        Row: {
          created_at: string
          device_info: Json | null
          enrollment_id: string | null
          id: string
          ip_address: string | null
          organization_id: string
          photo_url: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
          verified_at: string | null
          verified_by: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          enrollment_id?: string | null
          id?: string
          ip_address?: string | null
          organization_id: string
          photo_url?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          enrollment_id?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string
          photo_url?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_identifications_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_participants: {
        Row: {
          id: string
          joined_at: string
          left_at: string | null
          role: string
          user_id: string
          webinar_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: string
          user_id: string
          webinar_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: string
          user_id?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_participants_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinars: {
        Row: {
          access_type: string
          company_id: string | null
          course_id: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          embed_url: string | null
          external_url: string | null
          host_user_id: string
          id: string
          kinescope_live_id: string | null
          kinescope_video_id: string | null
          max_participants: number | null
          organization_id: string
          player_settings: Json | null
          recording_size_bytes: number | null
          recording_url: string | null
          room_name: string | null
          room_url: string | null
          rtmp_key: string | null
          rtmp_url: string | null
          scheduled_at: string
          source_type: string
          status: string
          stream_platform: string | null
          stream_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          access_type?: string
          company_id?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          embed_url?: string | null
          external_url?: string | null
          host_user_id: string
          id?: string
          kinescope_live_id?: string | null
          kinescope_video_id?: string | null
          max_participants?: number | null
          organization_id: string
          player_settings?: Json | null
          recording_size_bytes?: number | null
          recording_url?: string | null
          room_name?: string | null
          room_url?: string | null
          rtmp_key?: string | null
          rtmp_url?: string | null
          scheduled_at: string
          source_type?: string
          status?: string
          stream_platform?: string | null
          stream_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          access_type?: string
          company_id?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          embed_url?: string | null
          external_url?: string | null
          host_user_id?: string
          id?: string
          kinescope_live_id?: string | null
          kinescope_video_id?: string | null
          max_participants?: number | null
          organization_id?: string
          player_settings?: Json | null
          recording_size_bytes?: number | null
          recording_url?: string | null
          room_name?: string | null
          room_url?: string | null
          rtmp_key?: string | null
          rtmp_url?: string | null
          scheduled_at?: string
          source_type?: string
          status?: string
          stream_platform?: string | null
          stream_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinars_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinars_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinars_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_safe: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          last_visit_at: string | null
          organization_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          last_visit_at?: string | null
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          last_visit_at?: string | null
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      test_questions_for_students: {
        Row: {
          correct_answer: number | null
          explanation: string | null
          id: string | null
          image_url: string | null
          is_bank_question: boolean | null
          lesson_id: string | null
          options: Json | null
          order_index: number | null
          question: string | null
        }
        Insert: {
          correct_answer?: never
          explanation?: string | null
          id?: string | null
          image_url?: string | null
          is_bank_question?: boolean | null
          lesson_id?: string | null
          options?: Json | null
          order_index?: number | null
          question?: string | null
        }
        Update: {
          correct_answer?: never
          explanation?: string | null
          id?: string | null
          image_url?: string | null
          is_bank_question?: boolean | null
          lesson_id?: string | null
          options?: Json | null
          order_index?: number | null
          question?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _get_pw_key: { Args: never; Returns: string }
      admin_update_user_role: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      apply_free_plan_features: { Args: { org_id: string }; Returns: undefined }
      award_achievement: {
        Args: { p_achievement_code: string; p_user_id: string }
        Returns: undefined
      }
      become_referral_partner:
        | { Args: never; Returns: string }
        | { Args: { p_referred_by?: string }; Returns: string }
      count_org_completions_this_month: {
        Args: { org_id: string }
        Returns: number
      }
      count_org_students: { Args: { org_id: string }; Returns: number }
      create_organization: {
        Args: {
          p_contact_name?: string
          p_director_name?: string
          p_email: string
          p_inn?: string
          p_kpp?: string
          p_legal_address?: string
          p_name: string
          p_ogrn?: string
          p_phone?: string
        }
        Returns: string
      }
      current_company_id: { Args: never; Returns: string }
      current_organization_id: { Args: never; Returns: string }
      decrypt_password: { Args: { p_text: string }; Returns: string }
      encrypt_password: { Args: { p_text: string }; Returns: string }
      find_knowledge_bank_content: {
        Args: { p_min_similarity?: number; p_title: string }
        Returns: {
          content: string
          id: string
          similarity_score: number
          title: string
        }[]
      }
      find_similar_lesson_content: {
        Args: { p_min_similarity?: number; p_title: string }
        Returns: {
          content: string
          lesson_id: string
          similarity_score: number
          title: string
        }[]
      }
      get_all_decrypted_passwords: {
        Args: never
        Returns: {
          decrypted_password: string
          user_id: string
        }[]
      }
      get_decrypted_company_credentials: {
        Args: { p_company_id: string }
        Returns: {
          login_email: string
          login_password: string
        }[]
      }
      get_decrypted_consent_passport: {
        Args: { p_consent_id: string }
        Returns: string
      }
      get_decrypted_consent_passports: {
        Args: { p_consent_ids: string[] }
        Returns: {
          consent_id: string
          decrypted_passport: string
        }[]
      }
      get_decrypted_labor_password: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_decrypted_org_credentials: {
        Args: { p_organization_id: string }
        Returns: {
          login_email: string
          login_password: string
        }[]
      }
      get_decrypted_payment_settings: {
        Args: { p_organization_id: string }
        Returns: {
          is_test_mode: boolean
          password: string
          terminal_key: string
        }[]
      }
      get_decrypted_student_password: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_decrypted_student_passwords: {
        Args: { p_organization_id: string }
        Returns: {
          decrypted_password: string
          user_id: string
        }[]
      }
      get_registration_link_by_token: {
        Args: { link_token: string }
        Returns: {
          company_id: string
          course_id: string
          expires_at: string
          id: string
          name: string
          organization_id: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_storage_files: {
        Args: { bucket_name: string }
        Returns: {
          bucket_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          mime_type: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_lesson_time: {
        Args: { p_lesson_id: string; p_seconds: number; p_user_id: string }
        Returns: undefined
      }
      increment_promo_usage: { Args: { p_code: string }; Returns: undefined }
      lookup_profile_by_login: {
        Args: { p_login: string }
        Returns: {
          full_name: string
          organization_id: string
          user_id: string
        }[]
      }
      public_get_organization_by_slug: {
        Args: { p_slug: string }
        Returns: {
          id: string
          login_branding: Json
          name: string
          website_url: string
        }[]
      }
      public_lookup_user_by_login: {
        Args: { login_input: string }
        Returns: {
          user_id: string
        }[]
      }
      public_validate_registration_link: {
        Args: { token_input: string }
        Returns: {
          company_id: string
          course_id: string
          expires_at: string
          id: string
          name: string
          organization_id: string
          student_group_id: string
          token: string
          used_count: number
        }[]
      }
      recalc_enrollment_time: {
        Args: { p_enrollment_id: string }
        Returns: undefined
      }
      register_referral: {
        Args: { p_organization_id: string; p_ref_code: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      track_user_visit: { Args: { p_user_id: string }; Returns: undefined }
      upgrade_to_organization_role: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "organization"
        | "student"
        | "sales_manager"
        | "company"
      payer_type: "individual" | "legal_entity"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "organization",
        "student",
        "sales_manager",
        "company",
      ],
      payer_type: ["individual", "legal_entity"],
    },
  },
} as const
