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
          name: string
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
          name: string
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
          name?: string
          rarity?: string
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
          allow_video_seek: boolean
          category_id: string | null
          created_at: string
          description: string | null
          duration: string | null
          frdo_document_type: string | null
          frdo_profession_name: string | null
          frdo_professional_area: string | null
          frdo_program_type: string | null
          frdo_qualification_name: string | null
          frdo_qualification_rank: string | null
          frdo_specialty_group: string | null
          id: string
          is_published: boolean
          organization_id: string
          sequential_lessons: boolean
          skip_video_identification: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          allow_video_seek?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          frdo_document_type?: string | null
          frdo_profession_name?: string | null
          frdo_professional_area?: string | null
          frdo_program_type?: string | null
          frdo_qualification_name?: string | null
          frdo_qualification_rank?: string | null
          frdo_specialty_group?: string | null
          id?: string
          is_published?: boolean
          organization_id: string
          sequential_lessons?: boolean
          skip_video_identification?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          allow_video_seek?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          frdo_document_type?: string | null
          frdo_profession_name?: string | null
          frdo_professional_area?: string | null
          frdo_program_type?: string | null
          frdo_qualification_name?: string | null
          frdo_qualification_rank?: string | null
          frdo_specialty_group?: string | null
          id?: string
          is_published?: boolean
          organization_id?: string
          sequential_lessons?: boolean
          skip_video_identification?: boolean | null
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
      marketplace_courses: {
        Row: {
          course_id: string
          created_at: string
          description_short: string | null
          id: string
          is_active: boolean
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
          enabled_features: Json | null
          frdo_enabled: boolean
          id: string
          inn: string | null
          is_paid: boolean
          kpp: string | null
          legal_address: string | null
          login_branding: Json | null
          login_slug: string | null
          monthly_price: number | null
          name: string
          notify_on_limit_80: boolean
          notify_on_limit_exceeded: boolean
          ogrn: string | null
          paid_until: string | null
          phone: string | null
          signature_url: string | null
          stamp_url: string | null
          storage_limit_bytes: number
          student_dashboard_settings: Json | null
          tariff_type: string | null
          telegram_chat_id: string | null
          updated_at: string
          website_url: string | null
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
          enabled_features?: Json | null
          frdo_enabled?: boolean
          id?: string
          inn?: string | null
          is_paid?: boolean
          kpp?: string | null
          legal_address?: string | null
          login_branding?: Json | null
          login_slug?: string | null
          monthly_price?: number | null
          name: string
          notify_on_limit_80?: boolean
          notify_on_limit_exceeded?: boolean
          ogrn?: string | null
          paid_until?: string | null
          phone?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          storage_limit_bytes?: number
          student_dashboard_settings?: Json | null
          tariff_type?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          website_url?: string | null
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
          enabled_features?: Json | null
          frdo_enabled?: boolean
          id?: string
          inn?: string | null
          is_paid?: boolean
          kpp?: string | null
          legal_address?: string | null
          login_branding?: Json | null
          login_slug?: string | null
          monthly_price?: number | null
          name?: string
          notify_on_limit_80?: boolean
          notify_on_limit_exceeded?: boolean
          ogrn?: string | null
          paid_until?: string | null
          phone?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          storage_limit_bytes?: number
          student_dashboard_settings?: Json | null
          tariff_type?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          website_url?: string | null
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
          last_visit_at: string | null
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
          last_visit_at?: string | null
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
          last_visit_at?: string | null
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
          correct_answer: number
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
          correct_answer?: number
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
          correct_answer?: number
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
      admin_update_user_role: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      award_achievement: {
        Args: { p_achievement_code: string; p_user_id: string }
        Returns: undefined
      }
      create_organization:
        | {
            Args: {
              p_contact_name?: string
              p_email: string
              p_inn?: string
              p_name: string
              p_phone?: string
            }
            Returns: string
          }
        | {
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
      current_organization_id: { Args: never; Returns: string }
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
          token: string
          used_count: number
        }[]
      }
      track_user_visit: { Args: { p_user_id: string }; Returns: undefined }
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
