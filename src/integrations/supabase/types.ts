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
    PostgrestVersion: "14.5"
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
      admin_generated_documents: {
        Row: {
          counterparty_inn: string | null
          counterparty_kind: string
          counterparty_name: string
          created_at: string
          created_by: string | null
          doc_date: string
          doc_number: string | null
          doc_type: string
          html_content: string
          id: string
          plan: string | null
          sent_at: string | null
          sent_to_email: string | null
          sent_to_organization_id: string | null
          signature_id: string | null
          status: string
          updated_at: string
          variables: Json
        }
        Insert: {
          counterparty_inn?: string | null
          counterparty_kind?: string
          counterparty_name: string
          created_at?: string
          created_by?: string | null
          doc_date?: string
          doc_number?: string | null
          doc_type: string
          html_content: string
          id?: string
          plan?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          sent_to_organization_id?: string | null
          signature_id?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          counterparty_inn?: string | null
          counterparty_kind?: string
          counterparty_name?: string
          created_at?: string
          created_by?: string | null
          doc_date?: string
          doc_number?: string | null
          doc_type?: string
          html_content?: string
          id?: string
          plan?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          sent_to_organization_id?: string | null
          signature_id?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "admin_generated_documents_sent_to_organization_id_fkey"
            columns: ["sent_to_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_generated_documents_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "document_signatures"
            referencedColumns: ["id"]
          },
        ]
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
          expires_at: string | null
          full_name: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          expires_at?: string | null
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string | null
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_avatar_templates: {
        Row: {
          allow_interruptions: boolean | null
          created_at: string
          created_by: string | null
          greeting: string
          id: string
          image_url: string | null
          is_active: boolean
          language: string | null
          llm_model: string | null
          llm_provider: string | null
          model: string
          name: string
          organization_id: string
          session_minutes: number
          stt_model: string | null
          stt_provider: string | null
          style: string
          subject: string
          system_prompt: string
          tts_provider: string | null
          tts_voice: string | null
          updated_at: string
          voice_id: string
        }
        Insert: {
          allow_interruptions?: boolean | null
          created_at?: string
          created_by?: string | null
          greeting?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          language?: string | null
          llm_model?: string | null
          llm_provider?: string | null
          model?: string
          name?: string
          organization_id: string
          session_minutes?: number
          stt_model?: string | null
          stt_provider?: string | null
          style?: string
          subject?: string
          system_prompt?: string
          tts_provider?: string | null
          tts_voice?: string | null
          updated_at?: string
          voice_id?: string
        }
        Update: {
          allow_interruptions?: boolean | null
          created_at?: string
          created_by?: string | null
          greeting?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          language?: string | null
          llm_model?: string | null
          llm_provider?: string | null
          model?: string
          name?: string
          organization_id?: string
          session_minutes?: number
          stt_model?: string | null
          stt_provider?: string | null
          style?: string
          subject?: string
          system_prompt?: string
          tts_provider?: string | null
          tts_voice?: string | null
          updated_at?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_avatar_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_templates: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          kind: string
          name: string
          prompt: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          kind: string
          name: string
          prompt: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          prompt?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_templates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
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
      ai_tutor_sessions: {
        Row: {
          created_at: string
          duration_seconds: number
          ended_at: string | null
          id: string
          lesson_id: string | null
          max_duration_seconds: number
          organization_id: string | null
          room_name: string
          started_at: string
          status: string
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          lesson_id?: string | null
          max_duration_seconds?: number
          organization_id?: string | null
          room_name: string
          started_at?: string
          status?: string
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          lesson_id?: string | null
          max_duration_seconds?: number
          organization_id?: string | null
          room_name?: string
          started_at?: string
          status?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tutor_sessions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
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
      broadcast_companies_db: {
        Row: {
          company_name: string | null
          created_at: string
          email: string
          extra: Json
          first_name: string | null
          id: string
          last_campaign_id: string | null
          last_name: string | null
          last_sent_at: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email: string
          extra?: Json
          first_name?: string | null
          id?: string
          last_campaign_id?: string | null
          last_name?: string | null
          last_sent_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string
          extra?: Json
          first_name?: string | null
          id?: string
          last_campaign_id?: string | null
          last_name?: string | null
          last_sent_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_log_listens: {
        Row: {
          call_log_id: string
          id: string
          listened_at: string
          listener_user_id: string
          user_agent: string | null
        }
        Insert: {
          call_log_id: string
          id?: string
          listened_at?: string
          listener_user_id: string
          user_agent?: string | null
        }
        Update: {
          call_log_id?: string
          id?: string
          listened_at?: string
          listener_user_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_log_listens_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          answered_at: string | null
          company_inn: string | null
          company_name: string | null
          contract_id: string | null
          cost_rub: number | null
          created_at: string
          direction: string
          duration_sec: number | null
          ended_at: string | null
          exolve_call_id: string | null
          from_number: string | null
          has_recording: boolean
          id: string
          lead_id: string | null
          manager_user_id: string
          notes: string | null
          novofon_call_id: string | null
          proposal_id: string | null
          provider: string
          recording_duration_sec: number | null
          recording_url: string | null
          review_flag: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          started_at: string
          status: string
          to_number: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          company_inn?: string | null
          company_name?: string | null
          contract_id?: string | null
          cost_rub?: number | null
          created_at?: string
          direction?: string
          duration_sec?: number | null
          ended_at?: string | null
          exolve_call_id?: string | null
          from_number?: string | null
          has_recording?: boolean
          id?: string
          lead_id?: string | null
          manager_user_id: string
          notes?: string | null
          novofon_call_id?: string | null
          proposal_id?: string | null
          provider?: string
          recording_duration_sec?: number | null
          recording_url?: string | null
          review_flag?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          started_at?: string
          status?: string
          to_number: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          company_inn?: string | null
          company_name?: string | null
          contract_id?: string | null
          cost_rub?: number | null
          created_at?: string
          direction?: string
          duration_sec?: number | null
          ended_at?: string | null
          exolve_call_id?: string | null
          from_number?: string | null
          has_recording?: boolean
          id?: string
          lead_id?: string | null
          manager_user_id?: string
          notes?: string | null
          novofon_call_id?: string | null
          proposal_id?: string | null
          provider?: string
          recording_duration_sec?: number | null
          recording_url?: string | null
          review_flag?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          started_at?: string
          status?: string
          to_number?: string
          updated_at?: string
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
      checko_api_usage: {
        Row: {
          date: string
          last_balance: number | null
          last_used_at: string | null
          requests_count: number
          search_requests_count: number
        }
        Insert: {
          date: string
          last_balance?: number | null
          last_used_at?: string | null
          requests_count?: number
          search_requests_count?: number
        }
        Update: {
          date?: string
          last_balance?: number | null
          last_used_at?: string | null
          requests_count?: number
          search_requests_count?: number
        }
        Relationships: []
      }
      checko_pending_inns: {
        Row: {
          added_at: string
          inn: string
          note: string | null
        }
        Insert: {
          added_at?: string
          inn: string
          note?: string | null
        }
        Update: {
          added_at?: string
          inn?: string
          note?: string | null
        }
        Relationships: []
      }
      checko_search_presets: {
        Row: {
          active_only: boolean
          created_at: string
          created_by: string | null
          id: string
          licenses: string[]
          name: string
          okveds: string[]
          organization_id: string | null
          regions: number[]
          updated_at: string
        }
        Insert: {
          active_only?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          licenses?: string[]
          name: string
          okveds?: string[]
          organization_id?: string | null
          regions?: number[]
          updated_at?: string
        }
        Update: {
          active_only?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          licenses?: string[]
          name?: string
          okveds?: string[]
          organization_id?: string | null
          regions?: number[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checko_search_presets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      checko_search_runs: {
        Row: {
          active_only: boolean
          created_at: string
          created_by: string | null
          enriched_count: number
          error_message: string | null
          found_count: number
          id: string
          licenses: string[]
          okveds: string[]
          preset_id: string | null
          queued_count: number
          regions: number[]
          search_requests_used: number
          status: string
        }
        Insert: {
          active_only?: boolean
          created_at?: string
          created_by?: string | null
          enriched_count?: number
          error_message?: string | null
          found_count?: number
          id?: string
          licenses?: string[]
          okveds?: string[]
          preset_id?: string | null
          queued_count?: number
          regions?: number[]
          search_requests_used?: number
          status?: string
        }
        Update: {
          active_only?: boolean
          created_at?: string
          created_by?: string | null
          enriched_count?: number
          error_message?: string | null
          found_count?: number
          id?: string
          licenses?: string[]
          okveds?: string[]
          preset_id?: string | null
          queued_count?: number
          regions?: number[]
          search_requests_used?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "checko_search_runs_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "checko_search_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      checko_settings: {
        Row: {
          auto_enrich_enabled: boolean
          id: number
          last_auto_error: string | null
          last_auto_processed: number | null
          last_auto_run_at: string | null
          updated_at: string
        }
        Insert: {
          auto_enrich_enabled?: boolean
          id?: number
          last_auto_error?: string | null
          last_auto_processed?: number | null
          last_auto_run_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_enrich_enabled?: boolean
          id?: number
          last_auto_error?: string | null
          last_auto_processed?: number | null
          last_auto_run_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_error_logs: {
        Row: {
          app_version: string | null
          client_ip: string | null
          duration_ms: number | null
          error_kind: string
          error_message: string | null
          id: string
          method: string | null
          occurred_at: string
          occurrence_count: number
          organization_id: string | null
          page_route: string | null
          page_url: string | null
          proxy_used: boolean | null
          received_at: string
          response_content_type: string | null
          response_snippet: string | null
          status: number | null
          url_host: string | null
          url_path: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          client_ip?: string | null
          duration_ms?: number | null
          error_kind: string
          error_message?: string | null
          id?: string
          method?: string | null
          occurred_at?: string
          occurrence_count?: number
          organization_id?: string | null
          page_route?: string | null
          page_url?: string | null
          proxy_used?: boolean | null
          received_at?: string
          response_content_type?: string | null
          response_snippet?: string | null
          status?: number | null
          url_host?: string | null
          url_path?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          client_ip?: string | null
          duration_ms?: number | null
          error_kind?: string
          error_message?: string | null
          id?: string
          method?: string | null
          occurred_at?: string
          occurrence_count?: number
          organization_id?: string | null
          page_route?: string | null
          page_url?: string | null
          proxy_used?: boolean | null
          received_at?: string
          response_content_type?: string | null
          response_snippet?: string | null
          status?: number | null
          url_host?: string | null
          url_path?: string | null
          user_agent?: string | null
          user_id?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
          discount_percent: number | null
          first_viewed_at: string | null
          id: string
          intro_html: string | null
          is_template: boolean
          last_sent_at: string | null
          last_viewed_at: string | null
          linked_signature_id: string | null
          manager_id: string | null
          organization_id: string | null
          outro_html: string | null
          preset_id: string | null
          scope: string
          sender_email: string | null
          sender_name: string | null
          sender_website: string | null
          status: string
          tariff_plan: string | null
          template_id: string | null
          total_amount: number
          updated_at: string
          valid_until: string | null
          view_count: number
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
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number | null
          first_viewed_at?: string | null
          id?: string
          intro_html?: string | null
          is_template?: boolean
          last_sent_at?: string | null
          last_viewed_at?: string | null
          linked_signature_id?: string | null
          manager_id?: string | null
          organization_id?: string | null
          outro_html?: string | null
          preset_id?: string | null
          scope?: string
          sender_email?: string | null
          sender_name?: string | null
          sender_website?: string | null
          status?: string
          tariff_plan?: string | null
          template_id?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          view_count?: number
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
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number | null
          first_viewed_at?: string | null
          id?: string
          intro_html?: string | null
          is_template?: boolean
          last_sent_at?: string | null
          last_viewed_at?: string | null
          linked_signature_id?: string | null
          manager_id?: string | null
          organization_id?: string | null
          outro_html?: string | null
          preset_id?: string | null
          scope?: string
          sender_email?: string | null
          sender_name?: string | null
          sender_website?: string | null
          status?: string
          tariff_plan?: string | null
          template_id?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "commercial_proposals_linked_signature_id_fkey"
            columns: ["linked_signature_id"]
            isOneToOne: false
            referencedRelation: "document_signatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_proposals_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "sales_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_proposals_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "proposal_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_bik: string | null
          bank_corr_account: string | null
          bank_name: string | null
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
          phone: string | null
          postal_address: string | null
          signatory_authority_clause: string | null
          signatory_name_genitive: string | null
          signatory_position: string | null
          signature_url: string | null
          stamp_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_bik?: string | null
          bank_corr_account?: string | null
          bank_name?: string | null
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
          phone?: string | null
          postal_address?: string | null
          signatory_authority_clause?: string | null
          signatory_name_genitive?: string | null
          signatory_position?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_bik?: string | null
          bank_corr_account?: string | null
          bank_name?: string | null
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
          phone?: string | null
          postal_address?: string | null
          signatory_authority_clause?: string | null
          signatory_name_genitive?: string | null
          signatory_position?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
      company_staff: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["company_staff_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["company_staff_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["company_staff_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_staff_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      contract_template_registry: {
        Row: {
          counterparty_type: string
          created_at: string
          id: string
          manifest: Json
          name: string
          source_path: string
          source_sha256: string
          status: string
          template_format: string
          template_key: string
          template_sha256: string
          updated_at: string
          version_label: string
        }
        Insert: {
          counterparty_type: string
          created_at?: string
          id?: string
          manifest: Json
          name: string
          source_path: string
          source_sha256: string
          status?: string
          template_format?: string
          template_key: string
          template_sha256: string
          updated_at?: string
          version_label: string
        }
        Update: {
          counterparty_type?: string
          created_at?: string
          id?: string
          manifest?: Json
          name?: string
          source_path?: string
          source_sha256?: string
          status?: string
          template_format?: string
          template_key?: string
          template_sha256?: string
          updated_at?: string
          version_label?: string
        }
        Relationships: []
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
      course_landing_history: {
        Row: {
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          snapshot: Json
          source: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          snapshot: Json
          source?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          snapshot?: Json
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_landing_history_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string
          id: string
          order_index: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          order_index?: number
          title?: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          order_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
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
      course_snapshots: {
        Row: {
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          organization_id: string
          payload: Json
          reason: string
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          organization_id: string
          payload: Json
          reason?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          organization_id?: string
          payload?: Json
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_snapshots_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
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
          generation_progress: Json | null
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
          system_key: string | null
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
          generation_progress?: Json | null
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
          system_key?: string | null
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
          generation_progress?: Json | null
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
          system_key?: string | null
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
      data_subject_requests: {
        Row: {
          attachment_urls: string[] | null
          contact_email: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          request_type: string
          resolved_at: string | null
          resolved_by: string | null
          response: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_urls?: string[] | null
          contact_email?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id: string
          request_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          response?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_urls?: string[] | null
          contact_email?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          request_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          response?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_requests_organization_id_fkey"
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
      document_number_sequences: {
        Row: {
          doc_type: string
          last_number: number
          organization_id: string
          updated_at: string
          year: number
        }
        Insert: {
          doc_type: string
          last_number?: number
          organization_id: string
          updated_at?: string
          year: number
        }
        Update: {
          doc_type?: string
          last_number?: number
          organization_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      document_signatures: {
        Row: {
          created_at: string
          current_revision_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          document_hash: string | null
          document_html: string | null
          document_id: string | null
          document_snapshot_url: string | null
          document_title: string
          document_type: string
          email_open_token: string | null
          email_opened_at: string | null
          expires_at: string
          handwritten_scan_path: string | null
          hidden_for_recipient: boolean
          hidden_for_sender: boolean
          id: string
          linked_proposal_id: string | null
          mode: string
          organization_id: string
          pep_agreement_id: string | null
          recipient_email: string
          recipient_name: string
          recipient_type: string
          recipient_user_id: string | null
          rejected_at: string | null
          rejection_reason: string | null
          requires_bilateral: boolean
          sender_name: string | null
          sender_signed_at: string | null
          sender_signed_ip: string | null
          sender_signed_user_agent: string | null
          sender_user_id: string
          sent_at: string | null
          signature_method: string
          signature_token: string
          signed_at: string | null
          signed_document_path: string | null
          signed_ip: string | null
          signed_user_agent: string | null
          status: string
          template_version_id: string | null
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          current_revision_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_hash?: string | null
          document_html?: string | null
          document_id?: string | null
          document_snapshot_url?: string | null
          document_title: string
          document_type: string
          email_open_token?: string | null
          email_opened_at?: string | null
          expires_at?: string
          handwritten_scan_path?: string | null
          hidden_for_recipient?: boolean
          hidden_for_sender?: boolean
          id?: string
          linked_proposal_id?: string | null
          mode?: string
          organization_id: string
          pep_agreement_id?: string | null
          recipient_email: string
          recipient_name: string
          recipient_type: string
          recipient_user_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          requires_bilateral?: boolean
          sender_name?: string | null
          sender_signed_at?: string | null
          sender_signed_ip?: string | null
          sender_signed_user_agent?: string | null
          sender_user_id: string
          sent_at?: string | null
          signature_method?: string
          signature_token?: string
          signed_at?: string | null
          signed_document_path?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          status?: string
          template_version_id?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          current_revision_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_hash?: string | null
          document_html?: string | null
          document_id?: string | null
          document_snapshot_url?: string | null
          document_title?: string
          document_type?: string
          email_open_token?: string | null
          email_opened_at?: string | null
          expires_at?: string
          handwritten_scan_path?: string | null
          hidden_for_recipient?: boolean
          hidden_for_sender?: boolean
          id?: string
          linked_proposal_id?: string | null
          mode?: string
          organization_id?: string
          pep_agreement_id?: string | null
          recipient_email?: string
          recipient_name?: string
          recipient_type?: string
          recipient_user_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          requires_bilateral?: boolean
          sender_name?: string | null
          sender_signed_at?: string | null
          sender_signed_ip?: string | null
          sender_signed_user_agent?: string | null
          sender_user_id?: string
          sent_at?: string | null
          signature_method?: string
          signature_token?: string
          signed_at?: string | null
          signed_document_path?: string | null
          signed_ip?: string | null
          signed_user_agent?: string | null
          status?: string
          template_version_id?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_linked_proposal_id_fkey"
            columns: ["linked_proposal_id"]
            isOneToOne: false
            referencedRelation: "commercial_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_pep_agreement_id_fkey"
            columns: ["pep_agreement_id"]
            isOneToOne: false
            referencedRelation: "pep_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "org_contract_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      education_document_records: {
        Row: {
          birth_date: string | null
          course_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          delivery_details: string | null
          delivery_method: string
          document_number: string
          document_series: string | null
          document_status: string
          document_type: string
          education_result: string | null
          enrollment_id: string | null
          full_name: string
          group_id: string | null
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
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_details?: string | null
          delivery_method?: string
          document_number: string
          document_series?: string | null
          document_status?: string
          document_type: string
          education_result?: string | null
          enrollment_id?: string | null
          full_name: string
          group_id?: string | null
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
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          course_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_details?: string | null
          delivery_method?: string
          document_number?: string
          document_series?: string | null
          document_status?: string
          document_type?: string
          education_result?: string | null
          enrollment_id?: string | null
          full_name?: string
          group_id?: string | null
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
          user_id?: string | null
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
      email_campaign_clicks: {
        Row: {
          campaign_id: string
          clicked_at: string
          id: string
          ip_address: string | null
          recipient_id: string | null
          url: string
          user_agent: string | null
        }
        Insert: {
          campaign_id: string
          clicked_at?: string
          id?: string
          ip_address?: string | null
          recipient_id?: string | null
          url: string
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string
          clicked_at?: string
          id?: string
          ip_address?: string | null
          recipient_id?: string | null
          url?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_clicks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_clicks_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "email_campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_consent_log: {
        Row: {
          campaign_id: string
          confirmed_by: string | null
          created_at: string
          id: string
          method: string
          organization_id: string | null
          scope: string
        }
        Insert: {
          campaign_id: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          method: string
          organization_id?: string | null
          scope: string
        }
        Update: {
          campaign_id?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          method?: string
          organization_id?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_consent_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          city: string | null
          custom_data: Json | null
          email: string
          error: string | null
          first_name: string | null
          id: string
          last_name: string | null
          open_token: string
          opened_at: string | null
          organization: string | null
          position: string | null
          recipient_name: string | null
          sent_at: string | null
          status: string
          subject_variant: string | null
        }
        Insert: {
          campaign_id: string
          city?: string | null
          custom_data?: Json | null
          email: string
          error?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          open_token?: string
          opened_at?: string | null
          organization?: string | null
          position?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          subject_variant?: string | null
        }
        Update: {
          campaign_id?: string
          city?: string | null
          custom_data?: Json | null
          email?: string
          error?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          open_token?: string
          opened_at?: string | null
          organization?: string | null
          position?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          subject_variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          ab_sample_percent: number
          ab_sample_started_at: string | null
          ab_test_enabled: boolean
          ab_winner: string | null
          ab_winner_picked_at: string | null
          campaign_mode: string
          click_count: number
          completed_at: string | null
          consent_confirmed_at: string | null
          consent_confirmed_by: string | null
          created_at: string
          created_by: string | null
          delivery_mode: string
          domain_daily_limit: number | null
          failed_count: number
          from_name: string | null
          html_body: string
          id: string
          linked_course_id: string | null
          linked_webinar_id: string | null
          manual_emails: string[] | null
          name: string
          open_count: number
          operator_attested_at: string | null
          operator_attested_by: string | null
          organization_id: string | null
          paused_reason: string | null
          recipient_filter: Json | null
          recipient_source: string
          reply_to: string | null
          scheduled_at: string | null
          scope: string
          seed_emails: string[] | null
          send_timezone: string
          send_window_end: string
          send_window_start: string
          sender_id: string | null
          sent_count: number
          started_at: string | null
          status: string
          subject: string
          subject_b: string | null
          template_id: string | null
          test_mode: boolean
          total_recipients: number
          unsubscribe_count: number
          updated_at: string
          user_paused: boolean
          utm_enabled: boolean
        }
        Insert: {
          ab_sample_percent?: number
          ab_sample_started_at?: string | null
          ab_test_enabled?: boolean
          ab_winner?: string | null
          ab_winner_picked_at?: string | null
          campaign_mode?: string
          click_count?: number
          completed_at?: string | null
          consent_confirmed_at?: string | null
          consent_confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          delivery_mode?: string
          domain_daily_limit?: number | null
          failed_count?: number
          from_name?: string | null
          html_body: string
          id?: string
          linked_course_id?: string | null
          linked_webinar_id?: string | null
          manual_emails?: string[] | null
          name: string
          open_count?: number
          operator_attested_at?: string | null
          operator_attested_by?: string | null
          organization_id?: string | null
          paused_reason?: string | null
          recipient_filter?: Json | null
          recipient_source: string
          reply_to?: string | null
          scheduled_at?: string | null
          scope: string
          seed_emails?: string[] | null
          send_timezone?: string
          send_window_end?: string
          send_window_start?: string
          sender_id?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject: string
          subject_b?: string | null
          template_id?: string | null
          test_mode?: boolean
          total_recipients?: number
          unsubscribe_count?: number
          updated_at?: string
          user_paused?: boolean
          utm_enabled?: boolean
        }
        Update: {
          ab_sample_percent?: number
          ab_sample_started_at?: string | null
          ab_test_enabled?: boolean
          ab_winner?: string | null
          ab_winner_picked_at?: string | null
          campaign_mode?: string
          click_count?: number
          completed_at?: string | null
          consent_confirmed_at?: string | null
          consent_confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          delivery_mode?: string
          domain_daily_limit?: number | null
          failed_count?: number
          from_name?: string | null
          html_body?: string
          id?: string
          linked_course_id?: string | null
          linked_webinar_id?: string | null
          manual_emails?: string[] | null
          name?: string
          open_count?: number
          operator_attested_at?: string | null
          operator_attested_by?: string | null
          organization_id?: string | null
          paused_reason?: string | null
          recipient_filter?: Json | null
          recipient_source?: string
          reply_to?: string | null
          scheduled_at?: string | null
          scope?: string
          seed_emails?: string[] | null
          send_timezone?: string
          send_window_end?: string
          send_window_start?: string
          sender_id?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string
          subject_b?: string | null
          template_id?: string | null
          test_mode?: boolean
          total_recipients?: number
          unsubscribe_count?: number
          updated_at?: string
          user_paused?: boolean
          utm_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "mailing_senders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_conversations: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          last_direction: string
          last_message_at: string
          last_snippet: string | null
          lead_id: string | null
          remote_email: string
          remote_name: string | null
          sender_id: string
          status: string
          subject: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          last_direction?: string
          last_message_at?: string
          last_snippet?: string | null
          lead_id?: string | null
          remote_email: string
          remote_name?: string | null
          sender_id: string
          status?: string
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          last_direction?: string
          last_message_at?: string
          last_snippet?: string | null
          lead_id?: string | null
          remote_email?: string
          remote_name?: string | null
          sender_id?: string
          status?: string
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_conversations_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "email_sender_pool"
            referencedColumns: ["id"]
          },
        ]
      }
      email_drip_sends: {
        Row: {
          error: string | null
          id: string
          sent_at: string
          status: string
          step_id: string
          subscriber_id: string
        }
        Insert: {
          error?: string | null
          id?: string
          sent_at?: string
          status?: string
          step_id: string
          subscriber_id: string
        }
        Update: {
          error?: string | null
          id?: string
          sent_at?: string
          status?: string
          step_id?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drip_sends_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "email_drip_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drip_sends_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "email_drip_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_drip_sequences: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          recipient_source: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          recipient_source?: string
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          recipient_source?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_drip_steps: {
        Row: {
          created_at: string
          delay_days: number
          delay_hours: number
          html: string
          id: string
          sequence_id: string
          step_order: number
          subject: string
          template_id: string | null
        }
        Insert: {
          created_at?: string
          delay_days?: number
          delay_hours?: number
          html: string
          id?: string
          sequence_id: string
          step_order: number
          subject: string
          template_id?: string | null
        }
        Update: {
          created_at?: string
          delay_days?: number
          delay_hours?: number
          html?: string
          id?: string
          sequence_id?: string
          step_order?: number
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_drip_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_drip_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      email_drip_subscribers: {
        Row: {
          completed_at: string | null
          current_step: number
          email: string
          id: string
          next_send_at: string
          organization_id: string | null
          recipient_name: string | null
          sequence_id: string
          status: string
          subscribed_at: string
          unsubscribed_at: string | null
        }
        Insert: {
          completed_at?: string | null
          current_step?: number
          email: string
          id?: string
          next_send_at?: string
          organization_id?: string | null
          recipient_name?: string | null
          sequence_id: string
          status?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
        }
        Update: {
          completed_at?: string | null
          current_step?: number
          email?: string
          id?: string
          next_send_at?: string
          organization_id?: string | null
          recipient_name?: string | null
          sequence_id?: string
          status?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_drip_subscribers_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_drip_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          body_html: string | null
          body_text: string | null
          conversation_id: string
          created_at: string
          direction: string
          from_email: string
          from_name: string | null
          headers_raw: string | null
          id: string
          in_reply_to: string | null
          is_read: boolean
          message_id: string | null
          received_at: string
          references_ids: string | null
          send_error: string | null
          subject: string | null
          to_email: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          from_email: string
          from_name?: string | null
          headers_raw?: string | null
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          message_id?: string | null
          received_at?: string
          references_ids?: string | null
          send_error?: string | null
          subject?: string | null
          to_email: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          from_email?: string
          from_name?: string | null
          headers_raw?: string | null
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          message_id?: string | null
          received_at?: string
          references_ids?: string | null
          send_error?: string | null
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "email_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sender_pool: {
        Row: {
          app_password: string | null
          assigned_manager_id: string | null
          created_at: string
          daily_limit: number
          email: string
          encryption: string
          from_name: string | null
          host: string
          id: string
          imap_encryption: string
          imap_host: string | null
          imap_last_scan_at: string | null
          imap_last_uid: number
          imap_port: number
          is_active: boolean
          last_error: string | null
          last_error_at: string | null
          last_used_at: string | null
          notes: string | null
          port: number
          priority: number
          sends_reset_at: string
          sends_today: number
          total_sent: number
          updated_at: string
          warmup_daily_target: number
          warmup_enabled: boolean
          warmup_inbox_count: number
          warmup_spam_count: number
          warmup_start_count: number
          warmup_started_at: string | null
        }
        Insert: {
          app_password?: string | null
          assigned_manager_id?: string | null
          created_at?: string
          daily_limit?: number
          email: string
          encryption?: string
          from_name?: string | null
          host?: string
          id?: string
          imap_encryption?: string
          imap_host?: string | null
          imap_last_scan_at?: string | null
          imap_last_uid?: number
          imap_port?: number
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_used_at?: string | null
          notes?: string | null
          port?: number
          priority?: number
          sends_reset_at?: string
          sends_today?: number
          total_sent?: number
          updated_at?: string
          warmup_daily_target?: number
          warmup_enabled?: boolean
          warmup_inbox_count?: number
          warmup_spam_count?: number
          warmup_start_count?: number
          warmup_started_at?: string | null
        }
        Update: {
          app_password?: string | null
          assigned_manager_id?: string | null
          created_at?: string
          daily_limit?: number
          email?: string
          encryption?: string
          from_name?: string | null
          host?: string
          id?: string
          imap_encryption?: string
          imap_host?: string | null
          imap_last_scan_at?: string | null
          imap_last_uid?: number
          imap_port?: number
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_used_at?: string | null
          notes?: string | null
          port?: number
          priority?: number
          sends_reset_at?: string
          sends_today?: number
          total_sent?: number
          updated_at?: string
          warmup_daily_target?: number
          warmup_enabled?: boolean
          warmup_inbox_count?: number
          warmup_spam_count?: number
          warmup_start_count?: number
          warmup_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sender_pool_assigned_manager_id_fkey"
            columns: ["assigned_manager_id"]
            isOneToOne: false
            referencedRelation: "sales_managers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_address: string | null
          reason: string
          scope: string
          source_campaign_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          reason?: string
          scope?: string
          source_campaign_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          reason?: string
          scope?: string
          source_campaign_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_suppressions_source_campaign_id_fkey"
            columns: ["source_campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          html_body: string
          id: string
          is_default: boolean
          name: string
          organization_id: string | null
          scope: string
          subject: string
          updated_at: string
          variables: Json
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          html_body: string
          id?: string
          is_default?: boolean
          name: string
          organization_id?: string | null
          scope: string
          subject: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          html_body?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string | null
          scope?: string
          subject?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_warmup_pings: {
        Row: {
          attempts: number
          checked_at: string | null
          created_at: string
          id: string
          last_error: string | null
          placement: string | null
          recipient_id: string
          sender_id: string
          sent_at: string
          warmup_id: string
        }
        Insert: {
          attempts?: number
          checked_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          placement?: string | null
          recipient_id: string
          sender_id: string
          sent_at?: string
          warmup_id: string
        }
        Update: {
          attempts?: number
          checked_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          placement?: string | null
          recipient_id?: string
          sender_id?: string
          sent_at?: string
          warmup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_warmup_pings_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "email_sender_pool"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_warmup_pings_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "email_sender_pool"
            referencedColumns: ["id"]
          },
        ]
      }
      email_warmup_state: {
        Row: {
          scope_key: string
          sent_today: number
          sent_today_date: string
          started_at: string
          total_sent: number
          updated_at: string
        }
        Insert: {
          scope_key: string
          sent_today?: number
          sent_today_date?: string
          started_at?: string
          total_sent?: number
          updated_at?: string
        }
        Update: {
          scope_key?: string
          sent_today?: number
          sent_today_date?: string
          started_at?: string
          total_sent?: number
          updated_at?: string
        }
        Relationships: []
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
          extra_fields: Json | null
          id: string
          landing_referrer: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string | null
          status: string
          user_id: string
          utm: Json | null
        }
        Insert: {
          course_id: string
          created_at?: string
          extra_fields?: Json | null
          id?: string
          landing_referrer?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          status?: string
          user_id: string
          utm?: Json | null
        }
        Update: {
          course_id?: string
          created_at?: string
          extra_fields?: Json | null
          id?: string
          landing_referrer?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          status?: string
          user_id?: string
          utm?: Json | null
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
      exolve_sip_accounts: {
        Row: {
          caller_id_number: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          sip_password_enc: string
          sip_username: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caller_id_number?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sip_password_enc: string
          sip_username: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caller_id_number?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sip_password_enc?: string
          sip_username?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      frdo_signed_documents: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: string
          organization_id: string
          sent_to_admin_at: string | null
          status: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          organization_id: string
          sent_to_admin_at?: string | null
          status?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          organization_id?: string
          sent_to_admin_at?: string | null
          status?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "frdo_signed_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      group_documents: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          doc_status: string
          doc_type: string
          document_date: string | null
          document_number: string | null
          docx_sha256: string | null
          file_path: string | null
          fill_mode: string
          generation_status: string
          group_id: string
          html: string | null
          id: string
          is_current: boolean
          layout_format: string
          name: string
          organization_id: string
          package_batch_id: string | null
          package_version: number | null
          pdf_status: string
          source_note: string | null
          status: string
          student_user_id: string | null
          template_registry_key: string | null
          template_sha256: string | null
          template_version_label: string | null
          updated_at: string
          variables: Json
          variables_snapshot: Json | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          doc_status?: string
          doc_type: string
          document_date?: string | null
          document_number?: string | null
          docx_sha256?: string | null
          file_path?: string | null
          fill_mode?: string
          generation_status?: string
          group_id: string
          html?: string | null
          id?: string
          is_current?: boolean
          layout_format?: string
          name: string
          organization_id: string
          package_batch_id?: string | null
          package_version?: number | null
          pdf_status?: string
          source_note?: string | null
          status?: string
          student_user_id?: string | null
          template_registry_key?: string | null
          template_sha256?: string | null
          template_version_label?: string | null
          updated_at?: string
          variables?: Json
          variables_snapshot?: Json | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          doc_status?: string
          doc_type?: string
          document_date?: string | null
          document_number?: string | null
          docx_sha256?: string | null
          file_path?: string | null
          fill_mode?: string
          generation_status?: string
          group_id?: string
          html?: string | null
          id?: string
          is_current?: boolean
          layout_format?: string
          name?: string
          organization_id?: string
          package_batch_id?: string | null
          package_version?: number | null
          pdf_status?: string
          source_note?: string | null
          status?: string
          student_user_id?: string | null
          template_registry_key?: string | null
          template_sha256?: string | null
          template_version_label?: string | null
          updated_at?: string
          variables?: Json
          variables_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "group_documents_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "student_groups"
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
      incoming_documents: {
        Row: {
          counterparty_inn: string | null
          counterparty_name: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          doc_date: string | null
          doc_number: string | null
          doc_type: string
          file_path: string | null
          file_size: number | null
          file_url: string
          id: string
          notes: string | null
          organization_id: string
          related_billing_doc_id: string | null
          related_company_id: string | null
          related_signature_id: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          counterparty_inn?: string | null
          counterparty_name?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          doc_date?: string | null
          doc_number?: string | null
          doc_type?: string
          file_path?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          notes?: string | null
          organization_id: string
          related_billing_doc_id?: string | null
          related_company_id?: string | null
          related_signature_id?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          counterparty_inn?: string | null
          counterparty_name?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          doc_date?: string | null
          doc_number?: string | null
          doc_type?: string
          file_path?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          notes?: string | null
          organization_id?: string
          related_billing_doc_id?: string | null
          related_company_id?: string | null
          related_signature_id?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incoming_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_documents_related_billing_doc_id_fkey"
            columns: ["related_billing_doc_id"]
            isOneToOne: false
            referencedRelation: "org_billing_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_documents_related_company_id_fkey"
            columns: ["related_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_documents_related_signature_id_fkey"
            columns: ["related_signature_id"]
            isOneToOne: false
            referencedRelation: "document_signatures"
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
      kinescope_usage_cache: {
        Row: {
          billing_json: Json | null
          by_org_json: Json | null
          fetched_at: string
          id: string
          organization_id: string | null
          total_bytes: number
          total_seconds: number
          videos_count: number
        }
        Insert: {
          billing_json?: Json | null
          by_org_json?: Json | null
          fetched_at?: string
          id?: string
          organization_id?: string | null
          total_bytes?: number
          total_seconds?: number
          videos_count?: number
        }
        Update: {
          billing_json?: Json | null
          by_org_json?: Json | null
          fetched_at?: string
          id?: string
          organization_id?: string | null
          total_bytes?: number
          total_seconds?: number
          videos_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "kinescope_usage_cache_organization_id_fkey"
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
      landing_popups: {
        Row: {
          badge_text: string
          created_at: string
          cta_text: string
          delay_seconds: number
          description: string
          enabled: boolean
          id: string
          image_url: string | null
          name: string
          show_for_authenticated: boolean
          sort_order: number
          source_tag: string
          storage_key: string
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          badge_text?: string
          created_at?: string
          cta_text?: string
          delay_seconds?: number
          description?: string
          enabled?: boolean
          id?: string
          image_url?: string | null
          name: string
          show_for_authenticated?: boolean
          sort_order?: number
          source_tag?: string
          storage_key?: string
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Update: {
          badge_text?: string
          created_at?: string
          cta_text?: string
          delay_seconds?: number
          description?: string
          enabled?: boolean
          id?: string
          image_url?: string | null
          name?: string
          show_for_authenticated?: boolean
          sort_order?: number
          source_tag?: string
          storage_key?: string
          subtitle?: string
          title?: string
          updated_at?: string
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
          ai_avatar_allow_interruptions: boolean | null
          ai_avatar_greeting: string | null
          ai_avatar_image_url: string | null
          ai_avatar_language: string | null
          ai_avatar_llm_model: string | null
          ai_avatar_llm_provider: string | null
          ai_avatar_model: string | null
          ai_avatar_name: string | null
          ai_avatar_session_minutes: number | null
          ai_avatar_stt_model: string | null
          ai_avatar_stt_provider: string | null
          ai_avatar_style: string | null
          ai_avatar_subject: string | null
          ai_avatar_system_prompt: string | null
          ai_avatar_tts_provider: string | null
          ai_avatar_tts_voice: string | null
          ai_avatar_voice_id: string | null
          content: string | null
          course_id: string
          created_at: string
          id: string
          is_locked: boolean
          module_id: string | null
          order_index: number
          test_max_attempts: number | null
          test_passing_score: number
          test_questions_count: number | null
          test_questions_to_show: number | null
          test_show_answers: boolean
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          ai_avatar_allow_interruptions?: boolean | null
          ai_avatar_greeting?: string | null
          ai_avatar_image_url?: string | null
          ai_avatar_language?: string | null
          ai_avatar_llm_model?: string | null
          ai_avatar_llm_provider?: string | null
          ai_avatar_model?: string | null
          ai_avatar_name?: string | null
          ai_avatar_session_minutes?: number | null
          ai_avatar_stt_model?: string | null
          ai_avatar_stt_provider?: string | null
          ai_avatar_style?: string | null
          ai_avatar_subject?: string | null
          ai_avatar_system_prompt?: string | null
          ai_avatar_tts_provider?: string | null
          ai_avatar_tts_voice?: string | null
          ai_avatar_voice_id?: string | null
          content?: string | null
          course_id: string
          created_at?: string
          id?: string
          is_locked?: boolean
          module_id?: string | null
          order_index?: number
          test_max_attempts?: number | null
          test_passing_score?: number
          test_questions_count?: number | null
          test_questions_to_show?: number | null
          test_show_answers?: boolean
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          ai_avatar_allow_interruptions?: boolean | null
          ai_avatar_greeting?: string | null
          ai_avatar_image_url?: string | null
          ai_avatar_language?: string | null
          ai_avatar_llm_model?: string | null
          ai_avatar_llm_provider?: string | null
          ai_avatar_model?: string | null
          ai_avatar_name?: string | null
          ai_avatar_session_minutes?: number | null
          ai_avatar_stt_model?: string | null
          ai_avatar_stt_provider?: string | null
          ai_avatar_style?: string | null
          ai_avatar_subject?: string | null
          ai_avatar_system_prompt?: string | null
          ai_avatar_tts_provider?: string | null
          ai_avatar_tts_voice?: string | null
          ai_avatar_voice_id?: string | null
          content?: string | null
          course_id?: string
          created_at?: string
          id?: string
          is_locked?: boolean
          module_id?: string | null
          order_index?: number
          test_max_attempts?: number | null
          test_passing_score?: number
          test_questions_count?: number | null
          test_questions_to_show?: number | null
          test_show_answers?: boolean
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
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
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
      mailing_campaign_ledger: {
        Row: {
          campaign_id: string | null
          created_at: string
          failed_count: number
          id: string
          organization_id: string
          requested_by: string | null
          reserved_count: number
          sender_id: string
          sent_count: number
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          organization_id: string
          requested_by?: string | null
          reserved_count: number
          sender_id: string
          sent_count?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          organization_id?: string
          requested_by?: string | null
          reserved_count?: number
          sender_id?: string
          sent_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_campaign_ledger_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_campaign_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_campaign_ledger_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "mailing_senders"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_campaign_replies: {
        Row: {
          body_text: string | null
          campaign_id: string
          classification: string
          created_at: string
          id: string
          imap_uid: number
          in_reply_to: string | null
          interest_hours: number | null
          job_id: string
          message_id: string | null
          organization_id: string
          received_at: string
          recipient_id: string
          remote_email: string
          remote_name: string | null
          review_status: string
          sender_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body_text?: string | null
          campaign_id: string
          classification?: string
          created_at?: string
          id?: string
          imap_uid: number
          in_reply_to?: string | null
          interest_hours?: number | null
          job_id: string
          message_id?: string | null
          organization_id: string
          received_at: string
          recipient_id: string
          remote_email: string
          remote_name?: string | null
          review_status?: string
          sender_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body_text?: string | null
          campaign_id?: string
          classification?: string
          created_at?: string
          id?: string
          imap_uid?: number
          in_reply_to?: string | null
          interest_hours?: number | null
          job_id?: string
          message_id?: string | null
          organization_id?: string
          received_at?: string
          recipient_id?: string
          remote_email?: string
          remote_name?: string | null
          review_status?: string
          sender_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_campaign_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_campaign_replies_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "mailing_send_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_campaign_replies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_campaign_replies_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "email_campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_campaign_replies_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "mailing_senders"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_contacts: {
        Row: {
          city: string | null
          created_at: string
          custom_fields: Json
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          organization: string | null
          organization_id: string
          position: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          custom_fields?: Json
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          organization?: string | null
          organization_id: string
          position?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          organization?: string | null
          organization_id?: string
          position?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_deliverability_checks: {
        Row: {
          attempts: number
          checked_at: string | null
          created_at: string
          error_category: string | null
          id: string
          last_error: string | null
          organization_id: string
          placement: string | null
          probe_id: string
          run_date: string
          seed_id: string
          sender_id: string
          sent_at: string | null
          slot_index: number
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          checked_at?: string | null
          created_at?: string
          error_category?: string | null
          id?: string
          last_error?: string | null
          organization_id: string
          placement?: string | null
          probe_id?: string
          run_date: string
          seed_id: string
          sender_id: string
          sent_at?: string | null
          slot_index: number
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          checked_at?: string | null
          created_at?: string
          error_category?: string | null
          id?: string
          last_error?: string | null
          organization_id?: string
          placement?: string | null
          probe_id?: string
          run_date?: string
          seed_id?: string
          sender_id?: string
          sent_at?: string | null
          slot_index?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_deliverability_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_deliverability_checks_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "mailing_deliverability_seeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_deliverability_checks_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "mailing_senders"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_deliverability_seeds: {
        Row: {
          auth_status: string
          created_at: string
          created_by: string | null
          email: string
          error_category: string | null
          id: string
          imap_host: string
          imap_port: number
          imap_security: string
          imap_username: string
          is_active: boolean
          label: string
          last_checked_at: string | null
          last_tested_at: string | null
          latency_ms: number | null
          organization_id: string
          provider: string
          secret_encrypted: string | null
          updated_at: string
        }
        Insert: {
          auth_status?: string
          created_at?: string
          created_by?: string | null
          email: string
          error_category?: string | null
          id?: string
          imap_host: string
          imap_port?: number
          imap_security?: string
          imap_username: string
          is_active?: boolean
          label: string
          last_checked_at?: string | null
          last_tested_at?: string | null
          latency_ms?: number | null
          organization_id: string
          provider?: string
          secret_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          auth_status?: string
          created_at?: string
          created_by?: string | null
          email?: string
          error_category?: string | null
          id?: string
          imap_host?: string
          imap_port?: number
          imap_security?: string
          imap_username?: string
          is_active?: boolean
          label?: string
          last_checked_at?: string | null
          last_tested_at?: string | null
          latency_ms?: number | null
          organization_id?: string
          provider?: string
          secret_encrypted?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_deliverability_seeds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_reply_scan_state: {
        Row: {
          baseline_completed: boolean
          claim_token: string | null
          claimed_at: string | null
          created_at: string
          last_error: string | null
          last_error_category: string | null
          last_scanned_at: string | null
          last_uid: number
          sender_id: string
          updated_at: string
        }
        Insert: {
          baseline_completed?: boolean
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          last_error?: string | null
          last_error_category?: string | null
          last_scanned_at?: string | null
          last_uid?: number
          sender_id: string
          updated_at?: string
        }
        Update: {
          baseline_completed?: boolean
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          last_error?: string | null
          last_error_category?: string | null
          last_scanned_at?: string | null
          last_uid?: number
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_reply_scan_state_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: true
            referencedRelation: "mailing_senders"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_report_links: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          token: string
          updated_at: string
          view_count: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          token: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          token?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "mailing_report_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_report_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_seed_ledger: {
        Row: {
          campaign_id: string | null
          created_at: string
          failed_count: number
          id: string
          organization_id: string
          requested_by: string | null
          seed_count: number
          sender_id: string
          sent_count: number
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          organization_id: string
          requested_by?: string | null
          seed_count: number
          sender_id: string
          sent_count?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          organization_id?: string
          requested_by?: string | null
          seed_count?: number
          sender_id?: string
          sent_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_seed_ledger_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_seed_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_seed_ledger_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "mailing_senders"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_send_jobs: {
        Row: {
          attempt_count: number
          campaign_id: string
          claim_token: string | null
          claimed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          last_error_category: string | null
          not_before: string
          recipient_id: string
          sender_id: string
          sent_at: string | null
          smtp_message_id: string | null
          status: string
          step_no: number
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          campaign_id: string
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_error_category?: string | null
          not_before: string
          recipient_id: string
          sender_id: string
          sent_at?: string | null
          smtp_message_id?: string | null
          status?: string
          step_no?: number
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          campaign_id?: string
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_error_category?: string | null
          not_before?: string
          recipient_id?: string
          sender_id?: string
          sent_at?: string | null
          smtp_message_id?: string | null
          status?: string
          step_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_send_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_send_jobs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "email_campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_send_jobs_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "mailing_senders"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_senders: {
        Row: {
          created_at: string
          created_by: string | null
          daily_limit: number
          from_email: string
          from_name: string | null
          id: string
          imap_error_category: string | null
          imap_host: string | null
          imap_last_tested_at: string | null
          imap_latency_ms: number | null
          imap_port: number | null
          imap_security: string | null
          imap_status: string
          imap_username: string | null
          is_active: boolean
          label: string
          last_error: string | null
          last_tested_at: string | null
          organization_id: string
          password_encrypted: string | null
          preset_key: string | null
          smtp_error_category: string | null
          smtp_host: string
          smtp_latency_ms: number | null
          smtp_port: number
          smtp_security: string
          smtp_status: string
          smtp_username: string
          updated_at: string
          warmup_daily_target: number
          warmup_enabled: boolean
          warmup_last_run_at: string | null
          warmup_paused_reason: string | null
          warmup_start_count: number
          warmup_started_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          from_email: string
          from_name?: string | null
          id?: string
          imap_error_category?: string | null
          imap_host?: string | null
          imap_last_tested_at?: string | null
          imap_latency_ms?: number | null
          imap_port?: number | null
          imap_security?: string | null
          imap_status?: string
          imap_username?: string | null
          is_active?: boolean
          label: string
          last_error?: string | null
          last_tested_at?: string | null
          organization_id: string
          password_encrypted?: string | null
          preset_key?: string | null
          smtp_error_category?: string | null
          smtp_host: string
          smtp_latency_ms?: number | null
          smtp_port?: number
          smtp_security?: string
          smtp_status?: string
          smtp_username: string
          updated_at?: string
          warmup_daily_target?: number
          warmup_enabled?: boolean
          warmup_last_run_at?: string | null
          warmup_paused_reason?: string | null
          warmup_start_count?: number
          warmup_started_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_limit?: number
          from_email?: string
          from_name?: string | null
          id?: string
          imap_error_category?: string | null
          imap_host?: string | null
          imap_last_tested_at?: string | null
          imap_latency_ms?: number | null
          imap_port?: number | null
          imap_security?: string | null
          imap_status?: string
          imap_username?: string | null
          is_active?: boolean
          label?: string
          last_error?: string | null
          last_tested_at?: string | null
          organization_id?: string
          password_encrypted?: string | null
          preset_key?: string | null
          smtp_error_category?: string | null
          smtp_host?: string
          smtp_latency_ms?: number | null
          smtp_port?: number
          smtp_security?: string
          smtp_status?: string
          smtp_username?: string
          updated_at?: string
          warmup_daily_target?: number
          warmup_enabled?: boolean
          warmup_last_run_at?: string | null
          warmup_paused_reason?: string | null
          warmup_start_count?: number
          warmup_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mailing_senders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      marketplace_import_catalog: {
        Row: {
          course_id: string | null
          created_at: string
          description: string | null
          error_message: string | null
          hours: number | null
          id: string
          imported_at: string | null
          parent_category: string
          price_reference: number | null
          source_url: string
          status: string
          sub_category: string | null
          title: string
          updated_at: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          error_message?: string | null
          hours?: number | null
          id?: string
          imported_at?: string | null
          parent_category: string
          price_reference?: number | null
          source_url: string
          status?: string
          sub_category?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          error_message?: string | null
          hours?: number | null
          id?: string
          imported_at?: string | null
          parent_category?: string
          price_reference?: number | null
          source_url?: string
          status?: string
          sub_category?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_import_catalog_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
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
      module_access_overrides: {
        Row: {
          created_at: string
          id: string
          module_id: string
          unlock_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_id: string
          unlock_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module_id?: string
          unlock_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_access_overrides_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      module_access_schedules: {
        Row: {
          course_id: string
          created_at: string
          id: string
          module_id: string
          unlock_at: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          module_id: string
          unlock_at: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          module_id?: string
          unlock_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_access_schedules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_access_schedules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: true
            referencedRelation: "course_modules"
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
      notification_dedup_log: {
        Row: {
          created_at: string
          key: string
        }
        Insert: {
          created_at?: string
          key: string
        }
        Update: {
          created_at?: string
          key?: string
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
          deleted_at: string | null
          deleted_by: string | null
          doc_type: string
          file_url: string
          id: string
          name: string
          organization_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          doc_type?: string
          file_url: string
          id?: string
          name: string
          organization_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
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
      org_contract_template_versions: {
        Row: {
          body_html: string
          change_summary: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          name: string
          organization_id: string
          template_id: string
          variables: Json
          version: number
        }
        Insert: {
          body_html: string
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          name: string
          organization_id: string
          template_id: string
          variables?: Json
          version: number
        }
        Update: {
          body_html?: string
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          name?: string
          organization_id?: string
          template_id?: string
          variables?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_contract_template_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_contract_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "org_contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      org_contract_templates: {
        Row: {
          archived_at: string | null
          body_html: string
          counterparty_type: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          organization_id: string
          registry_template_key: string | null
          status: string
          template_format: string
          updated_at: string
          variables: Json
          version: number
        }
        Insert: {
          archived_at?: string | null
          body_html: string
          counterparty_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          organization_id: string
          registry_template_key?: string | null
          status?: string
          template_format?: string
          updated_at?: string
          variables?: Json
          version?: number
        }
        Update: {
          archived_at?: string | null
          body_html?: string
          counterparty_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          organization_id?: string
          registry_template_key?: string | null
          status?: string
          template_format?: string
          updated_at?: string
          variables?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_contract_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_contracts: {
        Row: {
          approved_at: string | null
          body_html: string | null
          company_id: string | null
          contract_date: string | null
          contract_number: string | null
          counterparty_type: string | null
          created_at: string
          docx_path: string | null
          docx_sha256: string | null
          file_path: string | null
          file_url: string | null
          generation_error: string | null
          generation_status: string
          id: string
          name: string
          organization_id: string
          pdf_path: string | null
          pdf_status: string
          signed_at: string | null
          status: string
          student_group_id: string | null
          student_user_id: string | null
          students: Json
          submission_key: string | null
          submission_snapshot_sha256: string | null
          template_format: string
          template_id: string | null
          template_manifest: Json | null
          template_registry_key: string | null
          template_sha256: string | null
          template_version: number | null
          template_version_label: string | null
          updated_at: string
          variables: Json
          variables_snapshot: Json | null
        }
        Insert: {
          approved_at?: string | null
          body_html?: string | null
          company_id?: string | null
          contract_date?: string | null
          contract_number?: string | null
          counterparty_type?: string | null
          created_at?: string
          docx_path?: string | null
          docx_sha256?: string | null
          file_path?: string | null
          file_url?: string | null
          generation_error?: string | null
          generation_status?: string
          id?: string
          name?: string
          organization_id: string
          pdf_path?: string | null
          pdf_status?: string
          signed_at?: string | null
          status?: string
          student_group_id?: string | null
          student_user_id?: string | null
          students?: Json
          submission_key?: string | null
          submission_snapshot_sha256?: string | null
          template_format?: string
          template_id?: string | null
          template_manifest?: Json | null
          template_registry_key?: string | null
          template_sha256?: string | null
          template_version?: number | null
          template_version_label?: string | null
          updated_at?: string
          variables?: Json
          variables_snapshot?: Json | null
        }
        Update: {
          approved_at?: string | null
          body_html?: string | null
          company_id?: string | null
          contract_date?: string | null
          contract_number?: string | null
          counterparty_type?: string | null
          created_at?: string
          docx_path?: string | null
          docx_sha256?: string | null
          file_path?: string | null
          file_url?: string | null
          generation_error?: string | null
          generation_status?: string
          id?: string
          name?: string
          organization_id?: string
          pdf_path?: string | null
          pdf_status?: string
          signed_at?: string | null
          status?: string
          student_group_id?: string | null
          student_user_id?: string | null
          students?: Json
          submission_key?: string | null
          submission_snapshot_sha256?: string | null
          template_format?: string
          template_id?: string | null
          template_manifest?: Json | null
          template_registry_key?: string | null
          template_sha256?: string | null
          template_version?: number | null
          template_version_label?: string | null
          updated_at?: string
          variables?: Json
          variables_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "org_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_contracts_student_group_id_fkey"
            columns: ["student_group_id"]
            isOneToOne: false
            referencedRelation: "student_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "org_contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      org_custom_roles: {
        Row: {
          base_role: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          base_role?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          base_role?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_custom_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_document_share_links: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          document_id: string
          download_count: number
          expires_at: string | null
          id: string
          is_active: boolean
          last_accessed_at: string | null
          max_downloads: number | null
          organization_id: string
          password_hash: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          document_id: string
          download_count?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          max_downloads?: number | null
          organization_id: string
          password_hash?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          document_id?: string
          download_count?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_accessed_at?: string | null
          max_downloads?: number | null
          organization_id?: string
          password_hash?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_document_share_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "org_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_document_share_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_document_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          document_id: string
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_url: string | null
          id: string
          organization_id: string
          uploaded_by: string | null
          uploaded_by_name: string | null
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          document_id: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          organization_id: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          version_number: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          document_id?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          organization_id?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "org_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_document_versions_organization_id_fkey"
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
          deleted_at: string | null
          deleted_by: string | null
          expires_at: string | null
          file_url: string | null
          id: string
          issue_date: string | null
          name: string
          organization_id: string
          reminder_sent_at: string | null
          responsible_person: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          name: string
          organization_id: string
          reminder_sent_at?: string | null
          responsible_person?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          name?: string
          organization_id?: string
          reminder_sent_at?: string | null
          responsible_person?: string | null
          status?: string
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
      org_services: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          price: number
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          price?: number
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          price?: number
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_signatories: {
        Row: {
          basis: string | null
          created_at: string
          created_by: string | null
          doc_types: string[] | null
          full_name: string
          id: string
          is_default: boolean
          notes: string | null
          organization_id: string
          position: string | null
          signature_url: string | null
          stamp_url: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          basis?: string | null
          created_at?: string
          created_by?: string | null
          doc_types?: string[] | null
          full_name: string
          id?: string
          is_default?: boolean
          notes?: string | null
          organization_id: string
          position?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          basis?: string | null
          created_at?: string
          created_by?: string | null
          doc_types?: string[] | null
          full_name?: string
          id?: string
          is_default?: boolean
          notes?: string | null
          organization_id?: string
          position?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_signatories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_smtp_settings: {
        Row: {
          created_at: string
          encryption: string
          from_email: string
          from_name: string | null
          host: string
          is_verified: boolean
          last_test_at: string | null
          last_test_error: string | null
          organization_id: string
          password_encrypted: string
          port: number
          provider_daily_limit: number
          safe_warmup_enabled: boolean
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          encryption?: string
          from_email: string
          from_name?: string | null
          host: string
          is_verified?: boolean
          last_test_at?: string | null
          last_test_error?: string | null
          organization_id: string
          password_encrypted: string
          port?: number
          provider_daily_limit?: number
          safe_warmup_enabled?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          encryption?: string
          from_email?: string
          from_name?: string | null
          host?: string
          is_verified?: boolean
          last_test_at?: string | null
          last_test_error?: string | null
          organization_id?: string
          password_encrypted?: string
          port?: number
          provider_daily_limit?: number
          safe_warmup_enabled?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_smtp_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_staff: {
        Row: {
          bio: string | null
          can_receive_crm_tasks: boolean
          created_at: string
          custom_role_id: string | null
          display_name: string
          expires_at: string | null
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
          can_receive_crm_tasks?: boolean
          created_at?: string
          custom_role_id?: string | null
          display_name?: string
          expires_at?: string | null
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
          can_receive_crm_tasks?: boolean
          created_at?: string
          custom_role_id?: string | null
          display_name?: string
          expires_at?: string | null
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
            foreignKeyName: "org_staff_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "org_custom_roles"
            referencedColumns: ["id"]
          },
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
          students_added_count: number
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
          students_added_count?: number
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
          students_added_count?: number
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
          platform_kinescope_folder_id: string | null
          promo_code: string | null
          public_slug: string | null
          referred_by_partner_id: string | null
          signature_url: string | null
          stamp_url: string | null
          storage_limit_bytes: number
          student_dashboard_settings: Json | null
          subscription_plan: string
          tariff_custom_label: string | null
          tariff_type: string | null
          telegram_chat_id: string | null
          telegram_notify_chat_id: string | null
          telegram_notify_enabled: boolean
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
          platform_kinescope_folder_id?: string | null
          promo_code?: string | null
          public_slug?: string | null
          referred_by_partner_id?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          storage_limit_bytes?: number
          student_dashboard_settings?: Json | null
          subscription_plan?: string
          tariff_custom_label?: string | null
          tariff_type?: string | null
          telegram_chat_id?: string | null
          telegram_notify_chat_id?: string | null
          telegram_notify_enabled?: boolean
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
          platform_kinescope_folder_id?: string | null
          promo_code?: string | null
          public_slug?: string | null
          referred_by_partner_id?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          storage_limit_bytes?: number
          student_dashboard_settings?: Json | null
          subscription_plan?: string
          tariff_custom_label?: string | null
          tariff_type?: string | null
          telegram_chat_id?: string | null
          telegram_notify_chat_id?: string | null
          telegram_notify_enabled?: boolean
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
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
      pep_agreements: {
        Row: {
          accepted_at: string
          agreement_text: string
          agreement_version: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          ip_address: string | null
          organization_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string
          agreement_text: string
          agreement_version?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          ip_address?: string | null
          organization_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string
          agreement_text?: string
          agreement_version?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pep_agreements_organization_id_fkey"
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
          archived_at: string | null
          avatar_url: string | null
          bio: string | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          chat_privacy: Json | null
          city: string | null
          company_id: string | null
          contact_email: string | null
          created_at: string
          email: string | null
          full_name: string | null
          generated_password: string | null
          id: string
          job_position: string | null
          last_seen_announcement_at: string | null
          last_visit_at: string | null
          lead_source: string | null
          lead_utm: Json | null
          login: string | null
          onboarding_completed: boolean
          organization_id: string | null
          phone: string | null
          region: string | null
          student_group_id: string | null
          telegram_link: string | null
          updated_at: string
          user_id: string
          vk_link: string | null
        }
        Insert: {
          archived_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          chat_privacy?: Json | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          generated_password?: string | null
          id?: string
          job_position?: string | null
          last_seen_announcement_at?: string | null
          last_visit_at?: string | null
          lead_source?: string | null
          lead_utm?: Json | null
          login?: string | null
          onboarding_completed?: boolean
          organization_id?: string | null
          phone?: string | null
          region?: string | null
          student_group_id?: string | null
          telegram_link?: string | null
          updated_at?: string
          user_id: string
          vk_link?: string | null
        }
        Update: {
          archived_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          chat_privacy?: Json | null
          city?: string | null
          company_id?: string | null
          contact_email?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          generated_password?: string | null
          id?: string
          job_position?: string | null
          last_seen_announcement_at?: string | null
          last_visit_at?: string | null
          lead_source?: string | null
          lead_utm?: Json | null
          login?: string | null
          onboarding_completed?: boolean
          organization_id?: string | null
          phone?: string | null
          region?: string | null
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
      program_training_plans: {
        Row: {
          course_id: string
          created_at: string
          form: string | null
          hours: number | null
          id: string
          organization_id: string
          plan_html: string
          title: string | null
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          form?: string | null
          hours?: number | null
          id?: string
          organization_id: string
          plan_html?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          form?: string | null
          hours?: number | null
          id?: string
          organization_id?: string
          plan_html?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_training_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_training_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      proposal_presets: {
        Row: {
          category: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          default_discount_percent: number
          default_email_template_id: string | null
          default_services: Json
          deleted_at: string | null
          description: string | null
          id: string
          intro_html: string
          is_default: boolean
          linked_course_id: string | null
          name: string
          organization_id: string | null
          outro_html: string
          scope: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          default_discount_percent?: number
          default_email_template_id?: string | null
          default_services?: Json
          deleted_at?: string | null
          description?: string | null
          id?: string
          intro_html?: string
          is_default?: boolean
          linked_course_id?: string | null
          name: string
          organization_id?: string | null
          outro_html?: string
          scope: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          default_discount_percent?: number
          default_email_template_id?: string | null
          default_services?: Json
          deleted_at?: string | null
          description?: string | null
          id?: string
          intro_html?: string
          is_default?: boolean
          linked_course_id?: string | null
          name?: string
          organization_id?: string | null
          outro_html?: string
          scope?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_presets_default_email_template_id_fkey"
            columns: ["default_email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_presets_linked_course_id_fkey"
            columns: ["linked_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_presets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      referral_attribution_log: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          organization_id: string | null
          partner_id: string | null
          reason: string | null
          ref_code: string
          source: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          partner_id?: string | null
          reason?: string | null
          ref_code: string
          source?: string | null
          status: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          partner_id?: string | null
          reason?: string | null
          ref_code?: string
          source?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_attribution_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_commissions: {
        Row: {
          amount: number
          bonus_type: string | null
          commission_amount: number
          created_at: string
          id: string
          invoice_id: string | null
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
          invoice_id?: string | null
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
          invoice_id?: string | null
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
          accepted_terms_at: string | null
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
          accepted_terms_at?: string | null
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
          accepted_terms_at?: string | null
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
      registration_attempt_rate_limits: {
        Row: {
          actor_hash: string
          created_at: string
          id: number
          scope: string
        }
        Insert: {
          actor_hash: string
          created_at?: string
          id?: number
          scope: string
        }
        Update: {
          actor_hash?: string
          created_at?: string
          id?: number
          scope?: string
        }
        Relationships: []
      }
      registration_attempts: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          error_message: string | null
          id: string
          inn: string | null
          ip: string | null
          org_name: string | null
          organization_id: string | null
          page_url: string | null
          phone: string | null
          promo_code: string | null
          ref_code: string | null
          referrer: string | null
          selected_plan: string | null
          step: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          error_message?: string | null
          id?: string
          inn?: string | null
          ip?: string | null
          org_name?: string | null
          organization_id?: string | null
          page_url?: string | null
          phone?: string | null
          promo_code?: string | null
          ref_code?: string | null
          referrer?: string | null
          selected_plan?: string | null
          step: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          error_message?: string | null
          id?: string
          inn?: string | null
          ip?: string | null
          org_name?: string | null
          organization_id?: string | null
          page_url?: string | null
          phone?: string | null
          promo_code?: string | null
          ref_code?: string | null
          referrer?: string | null
          selected_plan?: string | null
          step?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      registration_failure_alert_claims: {
        Row: {
          actor_hash: string
          created_at: string
          dedup_hash: string
          delivered_at: string | null
          lease_until: string | null
          state: string
          updated_at: string
        }
        Insert: {
          actor_hash: string
          created_at?: string
          dedup_hash: string
          delivered_at?: string | null
          lease_until?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          actor_hash?: string
          created_at?: string
          dedup_hash?: string
          delivered_at?: string | null
          lease_until?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
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
      role_audit_log: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          details: Json | null
          id: string
          new_role: string | null
          new_sections_access: Json | null
          old_role: string | null
          old_sections_access: Json | null
          organization_id: string | null
          performed_by: string | null
          performed_by_name: string | null
          scope: string
          target_email: string | null
          target_name: string | null
          target_user_id: string
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          new_role?: string | null
          new_sections_access?: Json | null
          old_role?: string | null
          old_sections_access?: Json | null
          organization_id?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          scope: string
          target_email?: string | null
          target_name?: string | null
          target_user_id: string
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          new_role?: string | null
          new_sections_access?: Json | null
          old_role?: string | null
          old_sections_access?: Json | null
          organization_id?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          scope?: string
          target_email?: string | null
          target_name?: string | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_blacklist: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          inn: string
          org_name: string | null
          organization_id: string | null
          reason: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          inn: string
          org_name?: string | null
          organization_id?: string | null
          reason?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          inn?: string
          org_name?: string | null
          organization_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_blacklist_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_companies_db: {
        Row: {
          address: string | null
          branches_count: number | null
          charter_capital: number | null
          city: string | null
          converted_to_lead_id: string | null
          created_at: string | null
          data_source: string | null
          director: string | null
          director_inn: string | null
          director_position: string | null
          email: string | null
          emails: string[] | null
          employee_count: number | null
          full_name: string | null
          has_education_license: boolean | null
          id: string
          inn: string
          kpp: string | null
          last_data_date: string | null
          license_activities: string[] | null
          license_authority: string | null
          license_issue_date: string | null
          license_number: string | null
          license_valid_to: string | null
          licenses: Json | null
          mass_address: boolean | null
          mass_director: boolean | null
          name: string
          ogrn: string | null
          okpo: string | null
          okved_list: string[] | null
          okved_main: string | null
          organization_id: string | null
          parsed_at: string | null
          phone: string | null
          phones: string[] | null
          predecessors: Json | null
          raw_data: Json | null
          region: string | null
          registration_date: string | null
          sanctions: boolean | null
          short_name: string | null
          social_links: Json | null
          source_url: string | null
          status: string | null
          successors: Json | null
          unfair_supplier: boolean | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          branches_count?: number | null
          charter_capital?: number | null
          city?: string | null
          converted_to_lead_id?: string | null
          created_at?: string | null
          data_source?: string | null
          director?: string | null
          director_inn?: string | null
          director_position?: string | null
          email?: string | null
          emails?: string[] | null
          employee_count?: number | null
          full_name?: string | null
          has_education_license?: boolean | null
          id?: string
          inn: string
          kpp?: string | null
          last_data_date?: string | null
          license_activities?: string[] | null
          license_authority?: string | null
          license_issue_date?: string | null
          license_number?: string | null
          license_valid_to?: string | null
          licenses?: Json | null
          mass_address?: boolean | null
          mass_director?: boolean | null
          name: string
          ogrn?: string | null
          okpo?: string | null
          okved_list?: string[] | null
          okved_main?: string | null
          organization_id?: string | null
          parsed_at?: string | null
          phone?: string | null
          phones?: string[] | null
          predecessors?: Json | null
          raw_data?: Json | null
          region?: string | null
          registration_date?: string | null
          sanctions?: boolean | null
          short_name?: string | null
          social_links?: Json | null
          source_url?: string | null
          status?: string | null
          successors?: Json | null
          unfair_supplier?: boolean | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          branches_count?: number | null
          charter_capital?: number | null
          city?: string | null
          converted_to_lead_id?: string | null
          created_at?: string | null
          data_source?: string | null
          director?: string | null
          director_inn?: string | null
          director_position?: string | null
          email?: string | null
          emails?: string[] | null
          employee_count?: number | null
          full_name?: string | null
          has_education_license?: boolean | null
          id?: string
          inn?: string
          kpp?: string | null
          last_data_date?: string | null
          license_activities?: string[] | null
          license_authority?: string | null
          license_issue_date?: string | null
          license_number?: string | null
          license_valid_to?: string | null
          licenses?: Json | null
          mass_address?: boolean | null
          mass_director?: boolean | null
          name?: string
          ogrn?: string | null
          okpo?: string | null
          okved_list?: string[] | null
          okved_main?: string | null
          organization_id?: string | null
          parsed_at?: string | null
          phone?: string | null
          phones?: string[] | null
          predecessors?: Json | null
          raw_data?: Json | null
          region?: string | null
          registration_date?: string | null
          sanctions?: boolean | null
          short_name?: string | null
          social_links?: Json | null
          source_url?: string | null
          status?: string | null
          successors?: Json | null
          unfair_supplier?: boolean | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_companies_db_converted_to_lead_id_fkey"
            columns: ["converted_to_lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_companies_db_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "sales_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_demo_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          kinescope_live_id: string | null
          label: string
          organization_id: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          kinescope_live_id?: string | null
          label?: string
          organization_id?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          kinescope_live_id?: string | null
          label?: string
          organization_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_demo_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_demo_sessions: {
        Row: {
          created_at: string
          demo_link_id: string
          id: string
          org_name: string | null
          organization_id: string | null
          participant_name: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          demo_link_id: string
          id?: string
          org_name?: string | null
          organization_id?: string | null
          participant_name?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          demo_link_id?: string
          id?: string
          org_name?: string | null
          organization_id?: string | null
          participant_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_demo_sessions_demo_link_id_fkey"
            columns: ["demo_link_id"]
            isOneToOne: false
            referencedRelation: "sales_demo_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_demo_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id: string
          manager_id: string
          organization_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string
          manager_id?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "sales_lead_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          next_contact_date: string | null
          notes: string | null
          ogrn: string | null
          org_name: string
          organization_id: string | null
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
          next_contact_date?: string | null
          notes?: string | null
          ogrn?: string | null
          org_name: string
          organization_id?: string | null
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
          next_contact_date?: string | null
          notes?: string | null
          ogrn?: string | null
          org_name?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "sales_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_managers: {
        Row: {
          created_at: string
          email_sender_mode: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          script_overrides: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email_sender_mode?: string
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          script_overrides?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          email_sender_mode?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          script_overrides?: Json | null
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
      sales_tasks: {
        Row: {
          assigned_user_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          id: string
          lead_id: string | null
          manager_id: string | null
          organization_id: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          id?: string
          lead_id?: string | null
          manager_id?: string | null
          organization_id?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          id?: string
          lead_id?: string | null
          manager_id?: string | null
          organization_id?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tasks_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "sales_managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tasks_organization_id_fkey"
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
      signature_comments: {
        Row: {
          author_name: string
          author_role: string
          author_user_id: string | null
          comment_text: string
          created_at: string
          id: string
          org_reply: string | null
          position_anchor: Json | null
          quoted_text: string | null
          resolution_status: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          revision_id: string | null
          signature_id: string
        }
        Insert: {
          author_name: string
          author_role?: string
          author_user_id?: string | null
          comment_text: string
          created_at?: string
          id?: string
          org_reply?: string | null
          position_anchor?: Json | null
          quoted_text?: string | null
          resolution_status?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          revision_id?: string | null
          signature_id: string
        }
        Update: {
          author_name?: string
          author_role?: string
          author_user_id?: string | null
          comment_text?: string
          created_at?: string
          id?: string
          org_reply?: string | null
          position_anchor?: Json | null
          quoted_text?: string | null
          resolution_status?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          revision_id?: string | null
          signature_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_comments_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "signature_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_comments_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "document_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_revisions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          document_hash: string | null
          document_html: string | null
          file_mime: string | null
          file_name: string | null
          file_url: string | null
          id: string
          signature_id: string
          version: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          document_hash?: string | null
          document_html?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          signature_id: string
          version: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          document_hash?: string | null
          document_html?: string | null
          file_mime?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          signature_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "signature_revisions_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "document_signatures"
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
      staff_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          company_id: string | null
          created_at: string
          custom_role_id: string | null
          email: string
          expires_at: string
          full_name: string | null
          id: string
          invitation_type: string
          invited_by: string
          invited_by_name: string | null
          organization_id: string | null
          revoked_at: string | null
          role: string
          sections_access: Json | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          company_id?: string | null
          created_at?: string
          custom_role_id?: string | null
          email: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invitation_type: string
          invited_by: string
          invited_by_name?: string | null
          organization_id?: string | null
          revoked_at?: string | null
          role: string
          sections_access?: Json | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          company_id?: string | null
          created_at?: string
          custom_role_id?: string | null
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invitation_type?: string
          invited_by?: string
          invited_by_name?: string | null
          organization_id?: string | null
          revoked_at?: string | null
          role?: string
          sections_access?: Json | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_organization_id_fkey"
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
          policy_url: string | null
          policy_version: string | null
          purposes: string[] | null
          signed_at: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
          withdrawn_at: string | null
          withdrawn_reason: string | null
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
          policy_url?: string | null
          policy_version?: string | null
          purposes?: string[] | null
          signed_at?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
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
          policy_url?: string | null
          policy_version?: string | null
          purposes?: string[] | null
          signed_at?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          withdrawn_at?: string | null
          withdrawn_reason?: string | null
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
      student_deletion_log: {
        Row: {
          created_at: string
          deleted_by: string | null
          deleted_by_email: string | null
          deleted_by_name: string | null
          deletion_type: string
          id: string
          metadata: Json | null
          organization_id: string | null
          reason: string | null
          student_email: string | null
          student_full_name: string | null
          student_id: string | null
          student_login: string | null
        }
        Insert: {
          created_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          deleted_by_name?: string | null
          deletion_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          reason?: string | null
          student_email?: string | null
          student_full_name?: string | null
          student_id?: string | null
          student_login?: string | null
        }
        Update: {
          created_at?: string
          deleted_by?: string | null
          deleted_by_email?: string | null
          deleted_by_name?: string | null
          deletion_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          reason?: string | null
          student_email?: string | null
          student_full_name?: string | null
          student_id?: string | null
          student_login?: string | null
        }
        Relationships: []
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
          passport_department_code: string | null
          passport_issue_date: string | null
          passport_issued_by: string | null
          passport_number: string | null
          passport_series: string | null
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
          passport_department_code?: string | null
          passport_issue_date?: string | null
          passport_issued_by?: string | null
          passport_number?: string | null
          passport_series?: string | null
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
          passport_department_code?: string | null
          passport_issue_date?: string | null
          passport_issued_by?: string | null
          passport_number?: string | null
          passport_series?: string | null
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
          course_id: string | null
          created_at: string
          curator_id: string | null
          default_price: number | null
          enable_channel: boolean
          enable_group_chat: boolean
          end_date: string | null
          group_number: string | null
          id: string
          instructor_name: string | null
          limit_access_time: boolean
          max_seats: number | null
          name: string
          organization_id: string
          program_form: string | null
          program_hours: number | null
          program_title: string | null
          schedule_access: boolean
          schedule_text: string | null
          show_locked_lessons: boolean
          start_date: string | null
          strict_order: boolean
          training_address: string | null
          training_dates: string[]
          updated_at: string
        }
        Insert: {
          block_resubmit?: boolean
          block_student_dialogs?: boolean
          color?: string | null
          course_id?: string | null
          created_at?: string
          curator_id?: string | null
          default_price?: number | null
          enable_channel?: boolean
          enable_group_chat?: boolean
          end_date?: string | null
          group_number?: string | null
          id?: string
          instructor_name?: string | null
          limit_access_time?: boolean
          max_seats?: number | null
          name: string
          organization_id: string
          program_form?: string | null
          program_hours?: number | null
          program_title?: string | null
          schedule_access?: boolean
          schedule_text?: string | null
          show_locked_lessons?: boolean
          start_date?: string | null
          strict_order?: boolean
          training_address?: string | null
          training_dates?: string[]
          updated_at?: string
        }
        Update: {
          block_resubmit?: boolean
          block_student_dialogs?: boolean
          color?: string | null
          course_id?: string | null
          created_at?: string
          curator_id?: string | null
          default_price?: number | null
          enable_channel?: boolean
          enable_group_chat?: boolean
          end_date?: string | null
          group_number?: string | null
          id?: string
          instructor_name?: string | null
          limit_access_time?: boolean
          max_seats?: number | null
          name?: string
          organization_id?: string
          program_form?: string | null
          program_hours?: number | null
          program_title?: string | null
          schedule_access?: boolean
          schedule_text?: string | null
          show_locked_lessons?: boolean
          start_date?: string | null
          strict_order?: boolean
          training_address?: string | null
          training_dates?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_groups_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
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
      student_login_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          organization_id: string
          revoked_at: string | null
          token: string
          use_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          organization_id: string
          revoked_at?: string | null
          token?: string
          use_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          organization_id?: string
          revoked_at?: string | null
          token?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      student_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
      support_conversations: {
        Row: {
          ai_failures_count: number
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          guest_token: string | null
          id: string
          last_message_at: string
          organization_id: string | null
          source: string
          status: string
          telegram_topic_id: number | null
          title: string | null
          unread_for_admin: number
          unread_for_user: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_failures_count?: number
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_token?: string | null
          id?: string
          last_message_at?: string
          organization_id?: string | null
          source?: string
          status?: string
          telegram_topic_id?: number | null
          title?: string | null
          unread_for_admin?: number
          unread_for_user?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_failures_count?: number
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_token?: string | null
          id?: string
          last_message_at?: string
          organization_id?: string | null
          source?: string
          status?: string
          telegram_topic_id?: number | null
          title?: string | null
          unread_for_admin?: number
          unread_for_user?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          role: string
          sender_name: string | null
          sender_user_id: string | null
          telegram_message_id: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          role: string
          sender_name?: string | null
          sender_user_id?: string | null
          telegram_message_id?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          role?: string
          sender_name?: string | null
          sender_user_id?: string | null
          telegram_message_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
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
      support_telegram_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
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
      telegram_domain_rate_limits: {
        Row: {
          action: string
          actor_hash: string
          created_at: string
          id: number
        }
        Insert: {
          action: string
          actor_hash: string
          created_at?: string
          id?: number
        }
        Update: {
          action?: string
          actor_hash?: string
          created_at?: string
          id?: number
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
      webinar_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_guest: boolean
          is_host: boolean
          sender_identity: string
          sender_name: string
          webinar_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_guest?: boolean
          is_host?: boolean
          sender_identity: string
          sender_name: string
          webinar_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_guest?: boolean
          is_host?: boolean
          sender_identity?: string
          sender_name?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_chat_messages_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
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
      webinar_poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          poll_id: string
          voter_identity: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          poll_id: string
          voter_identity: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          poll_id?: string
          voter_identity?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "webinar_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_polls: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          options: Json
          question: string
          status: string
          webinar_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          options: Json
          question: string
          status?: string
          webinar_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          options?: Json
          question?: string
          status?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_polls_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_questions: {
        Row: {
          answer_text: string | null
          answered: boolean
          answered_at: string | null
          answered_by: string | null
          author_identity: string
          author_name: string
          created_at: string
          id: string
          question: string
          upvotes: number
          webinar_id: string
        }
        Insert: {
          answer_text?: string | null
          answered?: boolean
          answered_at?: string | null
          answered_by?: string | null
          author_identity: string
          author_name: string
          created_at?: string
          id?: string
          question: string
          upvotes?: number
          webinar_id: string
        }
        Update: {
          answer_text?: string | null
          answered?: boolean
          answered_at?: string | null
          answered_by?: string | null
          author_identity?: string
          author_name?: string
          created_at?: string
          id?: string
          question?: string
          upvotes?: number
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_questions_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_rate_limits: {
        Row: {
          action: string
          created_at: string
          id: string
          identity: string
          webinar_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          identity: string
          webinar_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          identity?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_rate_limits_webinar_id_fkey"
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
          allow_guests: boolean
          auto_record: boolean
          company_id: string | null
          course_id: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          embed_url: string | null
          external_url: string | null
          guest_password: string | null
          host_user_id: string
          id: string
          kinescope_live_id: string | null
          kinescope_video_id: string | null
          max_participants: number | null
          organization_id: string
          player_settings: Json | null
          public_token: string | null
          recording_egress_id: string | null
          recording_ended_at: string | null
          recording_external_url: string | null
          recording_size_bytes: number | null
          recording_started_at: string | null
          recording_status: string | null
          recording_url: string | null
          reminders_sent: Json
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
          allow_guests?: boolean
          auto_record?: boolean
          company_id?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          embed_url?: string | null
          external_url?: string | null
          guest_password?: string | null
          host_user_id: string
          id?: string
          kinescope_live_id?: string | null
          kinescope_video_id?: string | null
          max_participants?: number | null
          organization_id: string
          player_settings?: Json | null
          public_token?: string | null
          recording_egress_id?: string | null
          recording_ended_at?: string | null
          recording_external_url?: string | null
          recording_size_bytes?: number | null
          recording_started_at?: string | null
          recording_status?: string | null
          recording_url?: string | null
          reminders_sent?: Json
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
          allow_guests?: boolean
          auto_record?: boolean
          company_id?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          embed_url?: string | null
          external_url?: string | null
          guest_password?: string | null
          host_user_id?: string
          id?: string
          kinescope_live_id?: string | null
          kinescope_video_id?: string | null
          max_participants?: number | null
          organization_id?: string
          player_settings?: Json | null
          public_token?: string | null
          recording_egress_id?: string | null
          recording_ended_at?: string | null
          recording_external_url?: string | null
          recording_size_bytes?: number | null
          recording_started_at?: string | null
          recording_status?: string | null
          recording_url?: string | null
          reminders_sent?: Json
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
      _email_daily_limit: { Args: { _day: number }; Returns: number }
      _get_pw_key: { Args: never; Returns: string }
      _org_email_sender_key: {
        Args: { _organization_id: string }
        Returns: string
      }
      _org_email_warmup_limit: { Args: { _day: number }; Returns: number }
      _phase_5c1c1_merge_legacy_quotas: {
        Args: never
        Returns: {
          final_today: number
          final_total: number
          legacy_today: number
          legacy_total: number
          org_count: number
          sender_hash: string
        }[]
      }
      _webinar_rate_check: {
        Args: {
          p_action: string
          p_identity: string
          p_max: number
          p_webinar_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      accept_org_staff_invitation: {
        Args: {
          _display_name?: string
          _token: string
          _user_email: string
          _user_id: string
        }
        Returns: Json
      }
      activate_verified_mailing_senders: {
        Args: { p_organization_id: string }
        Returns: number
      }
      add_signature_comment_by_token: {
        Args: {
          p_author_name: string
          p_comment_text: string
          p_position_anchor?: Json
          p_quoted_text: string
          p_token: string
        }
        Returns: string
      }
      add_signature_revision: {
        Args: {
          p_change_summary?: string
          p_document_html?: string
          p_file_mime?: string
          p_file_name?: string
          p_file_url?: string
          p_signature_id: string
        }
        Returns: string
      }
      admin_collect_media_references: {
        Args: never
        Returns: {
          entity_id: string
          entity_title: string
          entity_type: string
          organization_id: string
          reference_url: string
        }[]
      }
      admin_delete_company: {
        Args: { _company_id: string }
        Returns: undefined
      }
      admin_delete_organization: {
        Args: { _org_id: string }
        Returns: undefined
      }
      admin_update_user_role: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      apply_free_plan_features: { Args: { org_id: string }; Returns: undefined }
      attest_cold_outreach_campaign: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      award_achievement: {
        Args: { p_achievement_code: string; p_user_id: string }
        Returns: undefined
      }
      become_referral_partner:
        | { Args: never; Returns: string }
        | { Args: { p_referred_by?: string }; Returns: string }
        | {
            Args: { p_accepted_terms?: boolean; p_referred_by?: string }
            Returns: string
          }
      bulk_import_broadcast_companies: {
        Args: { p_rows: Json }
        Returns: number
      }
      can_access_course: {
        Args: { _course_id: string; _permission?: string }
        Returns: boolean
      }
      can_access_lesson: {
        Args: { _lesson_id: string; _permission?: string }
        Returns: boolean
      }
      can_access_organization: {
        Args: { _organization_id: string; _permission?: string }
        Returns: boolean
      }
      can_access_signed_contract_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      can_manage_course_file_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      can_manage_course_files_org: {
        Args: { _organization_id: string; _permission?: string }
        Returns: boolean
      }
      can_manage_webinar_recording_org: {
        Args: { _organization_id: string; _permission: string }
        Returns: boolean
      }
      can_read_course_file_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      can_read_lesson_attachment: {
        Args: { _lesson_id: string }
        Returns: boolean
      }
      can_read_webinar_recording_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      can_use_template: {
        Args: { p_plan: string; p_tier: string }
        Returns: boolean
      }
      claim_due_mailing_send_jobs: {
        Args: { p_batch_size?: number; p_stale_after?: string }
        Returns: {
          attempt_count: number
          campaign_id: string
          claim_token: string | null
          claimed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          last_error_category: string | null
          not_before: string
          recipient_id: string
          sender_id: string
          sent_at: string | null
          smtp_message_id: string | null
          status: string
          step_no: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mailing_send_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_mailing_reply_scan_senders: {
        Args: {
          p_batch_size?: number
          p_campaign_ids: string[]
          p_stale_after?: string
        }
        Returns: {
          baseline_completed: boolean
          claim_token: string | null
          claimed_at: string | null
          created_at: string
          last_error: string | null
          last_error_category: string | null
          last_scanned_at: string | null
          last_uid: number
          sender_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mailing_reply_scan_state"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_notification_dedup: { Args: { _key: string }; Returns: boolean }
      claim_org_email_quota: {
        Args: {
          p_count: number
          p_message_kind: string
          p_organization_id: string
        }
        Returns: Json
      }
      claim_registration_attempt_rate: {
        Args: {
          _actor_hash: string
          _max_requests: number
          _scope: string
          _window_seconds: number
        }
        Returns: string
      }
      claim_registration_failure_alert: {
        Args: {
          _actor_hash: string
          _dedup_hash: string
          _lease_seconds: number
        }
        Returns: string
      }
      claim_sales_leads: { Args: { _lead_ids: string[] }; Returns: number }
      claim_telegram_domain_delivery: {
        Args: {
          _action: string
          _actor_hash: string
          _dedup_key: string
          _max_requests: number
          _window_seconds: number
        }
        Returns: string
      }
      cleanup_client_error_logs: { Args: never; Returns: undefined }
      complete_own_course_enrollment: {
        Args: { p_enrollment_id: string }
        Returns: Json
      }
      complete_registration_failure_alert: {
        Args: {
          _dedup_hash: string
          _delivered: boolean
          _retry_after_seconds?: number
        }
        Returns: undefined
      }
      confirm_campaign_send_consent: {
        Args: { p_campaign_id: string; p_method?: string }
        Returns: string
      }
      confirm_campaign_send_consent_admin: {
        Args: { p_campaign_id: string; p_method?: string; p_user_id: string }
        Returns: string
      }
      consume_email_quota: {
        Args: { p_count: number; p_scope_key: string; p_skip_warmup?: boolean }
        Returns: Json
      }
      count_org_completions_this_month: {
        Args: { org_id: string }
        Returns: number
      }
      count_org_students: { Args: { org_id: string }; Returns: number }
      create_external_contract_signature:
        | {
            Args: {
              p_admin_email: string
              p_admin_name?: string
              p_document_title: string
              p_file_mime: string
              p_file_name: string
              p_file_url: string
              p_summary?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_admin_email: string
              p_admin_name?: string
              p_document_title: string
              p_file_mime: string
              p_file_name: string
              p_file_url: string
              p_organization_id?: string
              p_summary?: string
            }
            Returns: string
          }
      create_goreltech_group_document_batch: {
        Args: {
          p_actor_id: string
          p_docs: Json
          p_group_id: string
          p_organization_id: string
        }
        Returns: {
          batch_id: string
          batch_version: number
          inserted_count: number
        }[]
      }
      create_group_document_batch: {
        Args: { p_docs: Json; p_group_id: string; p_organization_id: string }
        Returns: {
          batch_id: string
          batch_version: number
          inserted_count: number
        }[]
      }
      create_imported_course: {
        Args: {
          p_description?: string
          p_organization_id: string
          p_title: string
        }
        Returns: string
      }
      create_mailing_report_link: {
        Args: { p_campaign_id: string; p_days?: number }
        Returns: Json
      }
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
      create_student_profile_with_capacity: {
        Args: {
          p_company_id: string
          p_email: string
          p_full_name: string
          p_generated_password: string
          p_login: string
          p_organization_id: string
          p_region: string
          p_student_group_id: string
          p_user_id: string
        }
        Returns: Json
      }
      current_company_id: { Args: never; Returns: string }
      current_organization_id: { Args: never; Returns: string }
      decrypt_password: { Args: { p_text: string }; Returns: string }
      delete_signature_comment_by_token: {
        Args: { p_comment_id: string; p_token: string }
        Returns: undefined
      }
      encrypt_password: { Args: { p_text: string }; Returns: string }
      ensure_sales_manager_for_current_user: { Args: never; Returns: string }
      expire_staff_invitations: { Args: never; Returns: number }
      expire_temporary_staff_roles: {
        Args: never
        Returns: {
          expired_admin: number
          expired_company: number
          expired_org: number
        }[]
      }
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
      generate_org_slug: { Args: { p_name: string }; Returns: string }
      get_admin_staff_role: { Args: { _user_id: string }; Returns: string }
      get_all_decrypted_passwords: {
        Args: never
        Returns: {
          decrypted_password: string
          user_id: string
        }[]
      }
      get_available_students_for_course_page: {
        Args: {
          p_course_id: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          email: string
          full_name: string
          id: string
          login: string
          total_count: number
          user_id: string
        }[]
      }
      get_campaign_recipient_preview: {
        Args: {
          p_manual_emails?: string[]
          p_organization_id: string
          p_scope: string
          p_source: string
        }
        Returns: Json
      }
      get_course_student_test_results_page: {
        Args: {
          p_course_id: string
          p_limit?: number
          p_offset?: number
          p_result_filter?: string
          p_search?: string
          p_status?: string
        }
        Returns: {
          active_count: number
          archived_at: string
          attempts_used: number
          average_percent: number
          average_progress: number
          completed_at: string
          completed_count: number
          email: string
          enrollment_id: string
          full_name: string
          id: string
          last_attempt_at: string
          latest_max_score: number
          latest_passing_score: number
          latest_percent: number
          latest_score: number
          login: string
          progress: number
          result_status: string
          started_at: string
          status: string
          test_details: Json
          tests_attempted: number
          tests_passed: number
          tests_total: number
          time_spent: number
          total_count: number
          user_id: string
        }[]
      }
      get_course_students_page: {
        Args: {
          p_course_id: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          active_count: number
          archived_at: string
          average_progress: number
          completed_at: string
          completed_count: number
          email: string
          enrollment_id: string
          full_name: string
          id: string
          login: string
          progress: number
          started_at: string
          status: string
          time_spent: number
          total_count: number
          user_id: string
        }[]
      }
      get_course_students_stats: {
        Args: { p_course_id: string }
        Returns: {
          active_count: number
          average_progress: number
          completed_count: number
          total_count: number
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
      get_decrypted_org_credentials_batch: {
        Args: { p_organization_ids: string[] }
        Returns: {
          login_email: string
          login_password: string
          organization_id: string
        }[]
      }
      get_decrypted_org_smtp: {
        Args: { p_organization_id: string }
        Returns: {
          encryption: string
          from_email: string
          from_name: string
          host: string
          password: string
          port: number
          username: string
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
      get_decrypted_student_passwords_for_users: {
        Args: { p_organization_id: string; p_user_ids: string[] }
        Returns: {
          decrypted_password: string
          user_id: string
        }[]
      }
      get_documents_kpi: { Args: { p_organization_id: string }; Returns: Json }
      get_exolve_sip_credentials: {
        Args: { _user_id: string }
        Returns: {
          caller_id_number: string
          is_active: boolean
          sip_password: string
          sip_username: string
        }[]
      }
      get_frdo_export_readiness: {
        Args: { p_organization_id: string }
        Returns: {
          missing_birth_date: number
          missing_frdo_data: number
          missing_gender_resolvable: number
          missing_gender_unresolvable: number
          missing_passport: number
          missing_profession_name: number
          missing_snils: number
          ready_for_export: number
          total_documents: number
        }[]
      }
      get_mailing_deliverability_seed_secret: {
        Args: { p_seed_id: string }
        Returns: {
          email: string
          id: string
          imap_host: string
          imap_port: number
          imap_security: string
          imap_username: string
          organization_id: string
          provider: string
          secret: string
        }[]
      }
      get_mailing_report_by_token: { Args: { p_token: string }; Returns: Json }
      get_mailing_sender_quota: {
        Args: { p_sender_id: string }
        Returns: {
          daily_limit: number
          remaining: number
          used_today: number
        }[]
      }
      get_mailing_sender_secret: {
        Args: { p_sender_id: string }
        Returns: {
          from_email: string
          from_name: string
          imap_host: string
          imap_port: number
          imap_security: string
          imap_username: string
          organization_id: string
          secret: string
          smtp_host: string
          smtp_port: number
          smtp_security: string
          smtp_username: string
        }[]
      }
      get_next_document_number: {
        Args: { p_doc_type: string; p_org: string; p_year?: number }
        Returns: number
      }
      get_org_email_delivery_status: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      get_org_staff_permissions: {
        Args: { _organization_id: string; _user_id: string }
        Returns: string[]
      }
      get_organization_core: { Args: { p_org_id: string }; Returns: Json }
      get_organization_course_overview: {
        Args: { p_organization_id: string }
        Returns: {
          course_id: string
          lessons_count: number
          students_count: number
        }[]
      }
      get_organization_dashboard_summary: {
        Args: { p_organization_id: string }
        Returns: {
          active_students_count: number
          average_progress: number
          completed_students_count: number
          documents_complete: number
          documents_total: number
          total_courses_count: number
          with_education: number
          with_passport: number
          with_snils: number
        }[]
      }
      get_organization_student_capacity: {
        Args: { p_organization_id: string; p_requested_count?: number }
        Returns: {
          can_add: boolean
          current_students: number
          is_unlimited: boolean
          limit_source: string
          max_students: number
          remaining_students: number
          subscription_plan: string
        }[]
      }
      get_organization_student_group_counts: {
        Args: { p_organization_id: string }
        Returns: {
          active_count: number
          archived_count: number
          group_id: string
          total_count: number
        }[]
      }
      get_organization_students_counts: {
        Args: { p_organization_id: string }
        Returns: {
          active_count: number
          archived_count: number
          total_count: number
        }[]
      }
      get_organization_students_page: {
        Args: {
          p_archive_mode?: string
          p_course_id?: string
          p_docs_filter?: string
          p_group_filter?: string
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_search?: string
          p_status?: string
        }
        Returns: {
          active_count: number
          archived_at: string
          archived_count: number
          company_id: string
          email: string
          enrollments: Json
          frdo_complete: boolean
          frdo_has_data: boolean
          full_name: string
          has_education: boolean
          has_passport: boolean
          has_snils: boolean
          id: string
          last_activity: string
          last_visit_at: string
          login: string
          progress: number
          status: string
          student_group_id: string
          total_count: number
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
      get_signature_by_token: {
        Args: { p_token: string }
        Returns: {
          current_revision_id: string
          document_hash: string
          document_html: string
          document_title: string
          document_type: string
          expires_at: string
          handwritten_scan_path: string
          id: string
          mode: string
          organization_id: string
          organization_inn: string
          organization_name: string
          pep_agreement_id: string
          recipient_email: string
          recipient_name: string
          recipient_user_id: string
          sender_name: string
          sender_signed_at: string
          sender_signed_ip: string
          signature_method: string
          signed_at: string
          signed_document_path: string
          signed_ip: string
          status: string
        }[]
      }
      get_signature_comments_by_token: {
        Args: { p_token: string }
        Returns: {
          author_name: string
          author_role: string
          comment_text: string
          created_at: string
          id: string
          org_reply: string
          position_anchor: Json
          quoted_text: string
          resolution_status: string
          resolved: boolean
          revision_id: string
        }[]
      }
      get_signature_revisions_by_token: {
        Args: { p_token: string }
        Returns: {
          change_summary: string
          created_at: string
          created_by_name: string
          document_hash: string
          document_html: string
          file_mime: string
          file_name: string
          file_url: string
          id: string
          version: number
        }[]
      }
      get_student_dashboard_snapshot: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_student_test_questions: {
        Args: { p_lesson_id: string }
        Returns: {
          explanation: string
          id: string
          image_url: string
          is_bank_question: boolean
          lesson_id: string
          options: Json
          order_index: number
          question: string
        }[]
      }
      get_user_companies: {
        Args: { _user_id: string }
        Returns: {
          company_id: string
          role: string
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
      get_warmup_status: { Args: { p_scope_key: string }; Returns: Json }
      has_admin_staff_role: {
        Args: { _role: string; _user_id: string }
        Returns: boolean
      }
      has_company_access: {
        Args: {
          _company_id: string
          _min_role?: Database["public"]["Enums"]["company_staff_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_org_ownership_identity: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      has_org_staff_permission: {
        Args: {
          _organization_id: string
          _permission: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
      hide_signature_for_viewer: {
        Args: { p_signature_id: string }
        Returns: undefined
      }
      import_mailing_contacts: {
        Args: { p_organization_id: string; p_rows: Json }
        Returns: Json
      }
      import_mailing_senders_batch: {
        Args: { p_organization_id: string; p_rows: Json }
        Returns: Json
      }
      increment_lesson_time: {
        Args: { p_lesson_id: string; p_seconds: number; p_user_id: string }
        Returns: undefined
      }
      increment_promo_usage: { Args: { p_code: string }; Returns: undefined }
      invoke_mailing_campaign_worker: { Args: never; Returns: number }
      invoke_mailing_deliverability_worker: { Args: never; Returns: number }
      invoke_mailing_reply_worker: { Args: never; Returns: number }
      is_active_sales_manager: { Args: { _uid: string }; Returns: boolean }
      is_broadcast_company: { Args: { p_email: string }; Returns: boolean }
      is_email_suppressed: {
        Args: { p_email: string; p_scope: string }
        Returns: boolean
      }
      is_org_owner: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      is_student_profile: {
        Args: { _org_id: string; _target_user_id: string }
        Returns: boolean
      }
      is_user_blocked: { Args: { _user_id: string }; Returns: boolean }
      is_webinar_org_member: { Args: { _webinar_id: string }; Returns: boolean }
      is_webinar_participant: {
        Args: { _user_id: string; _webinar_id: string }
        Returns: boolean
      }
      issue_education_document_batch: {
        Args: {
          p_course_id: string
          p_group_id: string
          p_items: Json
          p_organization_id: string
        }
        Returns: {
          birth_date: string | null
          course_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          delivery_details: string | null
          delivery_method: string
          document_number: string
          document_series: string | null
          document_status: string
          document_type: string
          education_result: string | null
          enrollment_id: string | null
          full_name: string
          group_id: string | null
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
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "education_document_records"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_org_task_assignees: {
        Args: { _org_id: string }
        Returns: {
          email: string
          full_name: string
          role: string
          user_id: string
        }[]
      }
      list_recycle_bin: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_search?: string
        }
        Returns: {
          deleted_at: string
          deleted_by: string
          display_name: string
          id: string
          meta: string
          organization_id: string
          source_table: string
          total_count: number
          type_label: string
        }[]
      }
      lookup_profile_by_login: {
        Args: { p_login: string }
        Returns: {
          full_name: string
          organization_id: string
          user_id: string
        }[]
      }
      lookup_staff_invitation: {
        Args: { _token: string }
        Returns: {
          accepted_at: string
          email: string
          expires_at: string
          full_name: string
          invitation_type: string
        }[]
      }
      mark_email_sender_result: {
        Args: { _error?: string; _sender_id: string }
        Returns: undefined
      }
      match_mailing_campaign_reply: {
        Args: {
          p_campaign_ids: string[]
          p_in_reply_to: string
          p_received_at: string
          p_remote_email: string
          p_sender_id: string
        }
        Returns: {
          campaign_id: string
          job_id: string
          organization_id: string
          recipient_id: string
        }[]
      }
      next_reg_number: {
        Args: { p_doc_type: string; p_org: string; p_year?: number }
        Returns: number
      }
      normalize_org_staff_permission: {
        Args: { _permission: string }
        Returns: string
      }
      org_finalize_signature_review: {
        Args: { p_action: string; p_message?: string; p_signature_id: string }
        Returns: undefined
      }
      org_role_default_permissions: {
        Args: { _role: string }
        Returns: string[]
      }
      pick_next_email_sender:
        | {
            Args: never
            Returns: {
              app_password: string
              email: string
              encryption: string
              from_name: string
              host: string
              id: string
              port: number
            }[]
          }
        | {
            Args: { p_manager_id: string }
            Returns: {
              app_password: string
              email: string
              encryption: string
              from_name: string
              host: string
              id: string
              port: number
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
      public_get_sales_demo_link: {
        Args: { p_token: string }
        Returns: {
          id: string
          is_active: boolean
          kinescope_live_id: string
          label: string
          token: string
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
      purchase_marketplace_course: {
        Args: {
          p_buyer_type?: string
          p_marketplace_course_id: string
          p_notes?: string
          p_students_count?: number
          p_target_organization_id: string
        }
        Returns: Json
      }
      purge_recycle_bin_30d: { Args: never; Returns: number }
      recalc_enrollment_time: {
        Args: { p_enrollment_id: string }
        Returns: undefined
      }
      record_mailing_campaign_result: {
        Args: { p_failed: number; p_ledger_id: string; p_sent: number }
        Returns: undefined
      }
      record_mailing_seed_result: {
        Args: { p_failed: number; p_ledger_id: string; p_sent: number }
        Returns: undefined
      }
      register_referral:
        | {
            Args: { p_organization_id: string; p_ref_code: string }
            Returns: undefined
          }
        | {
            Args: {
              p_organization_id: string
              p_ref_code: string
              p_source?: string
              p_user_agent?: string
            }
            Returns: Json
          }
      remove_org_staff_member: {
        Args: { p_staff_id: string }
        Returns: boolean
      }
      request_signature_changes: {
        Args: { p_summary?: string; p_token: string }
        Returns: undefined
      }
      reserve_mailing_campaign_quota: {
        Args: {
          p_campaign_id: string
          p_count: number
          p_requested_by?: string
          p_sender_id: string
        }
        Returns: {
          allowed: boolean
          daily_limit: number
          ledger_id: string
          reason: string
          remaining: number
        }[]
      }
      reserve_mailing_seed_quota: {
        Args: {
          p_campaign_id: string
          p_cooldown_seconds?: number
          p_count: number
          p_requested_by?: string
          p_sender_id: string
        }
        Returns: {
          allowed: boolean
          ledger_id: string
          reason: string
          remaining: number
        }[]
      }
      resolve_campaign_recipients: {
        Args: { p_campaign_id: string }
        Returns: {
          email: string
          recipient_name: string
        }[]
      }
      resolve_email_recipient_candidates: {
        Args: {
          p_manual_emails: string[]
          p_organization_id: string
          p_scope: string
          p_source: string
        }
        Returns: {
          email: string
          recipient_name: string
        }[]
      }
      resolve_email_recipient_raw_candidates: {
        Args: {
          p_manual_emails: string[]
          p_organization_id: string
          p_scope: string
          p_source: string
        }
        Returns: {
          email_raw: string
          name_raw: string
        }[]
      }
      restore_course_snapshot: { Args: { _snapshot_id: string }; Returns: Json }
      restore_document: {
        Args: { p_id: string; p_table: string }
        Returns: boolean
      }
      revoke_mailing_report_link: {
        Args: { p_link_id: string }
        Returns: boolean
      }
      revoke_signature: {
        Args: { p_reason?: string; p_signature_id: string }
        Returns: Json
      }
      save_student_frdo_data: {
        Args: { p_data: Json; p_organization_id: string; p_user_id: string }
        Returns: {
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
          passport_department_code: string | null
          passport_issue_date: string | null
          passport_issued_by: string | null
          passport_number: string | null
          passport_series: string | null
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
        SetofOptions: {
          from: "*"
          to: "student_frdo_data"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sender_countersign: {
        Args: { p_ip?: string; p_signature_id: string; p_user_agent?: string }
        Returns: undefined
      }
      set_exolve_sip_credentials: {
        Args: {
          _caller_id_number?: string
          _is_active?: boolean
          _sip_password: string
          _sip_username: string
          _user_id: string
        }
        Returns: string
      }
      set_mailing_sender_warmup: {
        Args: {
          p_daily_target?: number
          p_enabled?: boolean
          p_sender_id: string
        }
        Returns: undefined
      }
      set_signature_comment_resolution: {
        Args: {
          p_comment_id: string
          p_org_reply?: string
          p_resolution_status: string
        }
        Returns: undefined
      }
      set_student_blocked: {
        Args: { _blocked: boolean; _reason?: string; _target_user_id: string }
        Returns: undefined
      }
      soft_delete_document: {
        Args: { p_id: string; p_table: string }
        Returns: boolean
      }
      storage_try_uuid: { Args: { _value: string }; Returns: string }
      track_user_visit: { Args: { p_user_id: string }; Returns: undefined }
      transfer_org_ownership_atomic: {
        Args: { p_new_owner_user_id: string; p_organization_id: string }
        Returns: boolean
      }
      update_signature_revision_html: {
        Args: { p_html: string; p_revision_id: string }
        Returns: undefined
      }
      update_student_group_settings: {
        Args: { p_group_id: string; p_patch: Json }
        Returns: {
          block_resubmit: boolean
          block_student_dialogs: boolean
          color: string | null
          course_id: string | null
          created_at: string
          curator_id: string | null
          default_price: number | null
          enable_channel: boolean
          enable_group_chat: boolean
          end_date: string | null
          group_number: string | null
          id: string
          instructor_name: string | null
          limit_access_time: boolean
          max_seats: number | null
          name: string
          organization_id: string
          program_form: string | null
          program_hours: number | null
          program_title: string | null
          schedule_access: boolean
          schedule_text: string | null
          show_locked_lessons: boolean
          start_date: string | null
          strict_order: boolean
          training_address: string | null
          training_dates: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upgrade_to_organization_role: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: undefined
      }
      validate_and_track_share_link: {
        Args: { _token: string }
        Returns: {
          document_id: string
          is_valid: boolean
          organization_id: string
          reason: string
        }[]
      }
      verify_webinar_guest_password: {
        Args: { p_password: string; p_public_token: string }
        Returns: boolean
      }
      webinar_post_chat: {
        Args: {
          p_content: string
          p_is_guest: boolean
          p_sender_identity: string
          p_sender_name: string
          p_webinar_id: string
        }
        Returns: string
      }
      webinar_post_question: {
        Args: {
          p_author_identity: string
          p_author_name: string
          p_is_guest: boolean
          p_question: string
          p_webinar_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "organization"
        | "student"
        | "sales_manager"
        | "company"
      company_staff_role: "owner" | "manager" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      company_staff_role: ["owner", "manager", "viewer"],
      payer_type: ["individual", "legal_entity"],
    },
  },
} as const
