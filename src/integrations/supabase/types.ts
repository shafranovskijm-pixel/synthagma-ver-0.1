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
      companies: {
        Row: {
          address: string | null
          created_at: string
          director: string | null
          id: string
          inn: string | null
          kpp: string | null
          name: string
          ogrn: string | null
          organization_id: string
          signature_url: string | null
          stamp_url: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          director?: string | null
          id?: string
          inn?: string | null
          kpp?: string | null
          name: string
          ogrn?: string | null
          organization_id: string
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          director?: string | null
          id?: string
          inn?: string | null
          kpp?: string | null
          name?: string
          ogrn?: string | null
          organization_id?: string
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string
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
      course_categories: {
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
      courses: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          duration: string | null
          id: string
          is_published: boolean
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          is_published?: boolean
          organization_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          is_published?: boolean
          organization_id?: string
          title?: string
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
      enrollments: {
        Row: {
          completed_at: string | null
          course_id: string
          id: string
          progress: number
          started_at: string
          status: string
          time_spent: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          id?: string
          progress?: number
          started_at?: string
          status?: string
          time_spent?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
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
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          id: string
          lesson_id: string
          time_spent: number
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id: string
          time_spent?: number
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id?: string
          time_spent?: number
          user_id?: string
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
          order_index: number
          test_questions_count: number | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          course_id: string
          created_at?: string
          id?: string
          order_index?: number
          test_questions_count?: number | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          course_id?: string
          created_at?: string
          id?: string
          order_index?: number
          test_questions_count?: number | null
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
          ai_tokens_used: number
          created_at: string
          id: string
          month_start: string
          organization_id: string
          storage_bytes: number
          updated_at: string
        }
        Insert: {
          ai_tokens_used?: number
          created_at?: string
          id?: string
          month_start?: string
          organization_id: string
          storage_bytes?: number
          updated_at?: string
        }
        Update: {
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
          ai_tokens_limit: number
          bank_account: string | null
          bank_bik: string | null
          bank_corr_account: string | null
          bank_name: string | null
          branding: Json | null
          contact_name: string | null
          created_at: string
          director_name: string | null
          director_position: string | null
          email: string
          id: string
          inn: string | null
          kpp: string | null
          legal_address: string | null
          name: string
          notify_on_limit_80: boolean
          notify_on_limit_exceeded: boolean
          ogrn: string | null
          phone: string | null
          signature_url: string | null
          stamp_url: string | null
          storage_limit_bytes: number
          student_dashboard_settings: Json | null
          updated_at: string
        }
        Insert: {
          actual_address?: string | null
          ai_enabled?: boolean
          ai_tokens_limit?: number
          bank_account?: string | null
          bank_bik?: string | null
          bank_corr_account?: string | null
          bank_name?: string | null
          branding?: Json | null
          contact_name?: string | null
          created_at?: string
          director_name?: string | null
          director_position?: string | null
          email: string
          id?: string
          inn?: string | null
          kpp?: string | null
          legal_address?: string | null
          name: string
          notify_on_limit_80?: boolean
          notify_on_limit_exceeded?: boolean
          ogrn?: string | null
          phone?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          storage_limit_bytes?: number
          student_dashboard_settings?: Json | null
          updated_at?: string
        }
        Update: {
          actual_address?: string | null
          ai_enabled?: boolean
          ai_tokens_limit?: number
          bank_account?: string | null
          bank_bik?: string | null
          bank_corr_account?: string | null
          bank_name?: string | null
          branding?: Json | null
          contact_name?: string | null
          created_at?: string
          director_name?: string | null
          director_position?: string | null
          email?: string
          id?: string
          inn?: string | null
          kpp?: string | null
          legal_address?: string | null
          name?: string
          notify_on_limit_80?: boolean
          notify_on_limit_exceeded?: boolean
          ogrn?: string | null
          phone?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          storage_limit_bytes?: number
          student_dashboard_settings?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          generated_password: string | null
          id: string
          login: string | null
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          generated_password?: string | null
          id?: string
          login?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          generated_password?: string | null
          id?: string
          login?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id?: string
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
        ]
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
          correct_answer: number
          explanation: string | null
          id: string
          is_bank_question: boolean
          lesson_id: string
          options: Json
          order_index: number
          question: string
        }
        Insert: {
          correct_answer?: number
          explanation?: string | null
          id?: string
          is_bank_question?: boolean
          lesson_id: string
          options?: Json
          order_index?: number
          question: string
        }
        Update: {
          correct_answer?: number
          explanation?: string | null
          id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_update_user_role: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      create_organization: {
        Args: {
          p_contact_name?: string
          p_email: string
          p_inn?: string
          p_name: string
          p_phone?: string
        }
        Returns: string
      }
      current_organization_id: { Args: never; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      upgrade_to_organization_role: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "organization" | "student"
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
      app_role: ["admin", "organization", "student"],
    },
  },
} as const
