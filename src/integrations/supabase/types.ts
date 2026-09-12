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
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      content_sources: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string | null
          source_type: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          source_type: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          source_type?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      linkedin_targets: {
        Row: {
          access_token: string | null
          avatar_url: string | null
          created_at: string
          id: string
          is_default: boolean
          kind: string
          name: string
          refresh_token: string | null
          scopes: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          urn: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          urn: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          urn?: string
          user_id?: string
        }
        Relationships: []
      }
      publication_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          error_message: string | null
          id: string
          publication_job_id: string
          provider_response: Json | null
          provider_status: number | null
          started_at: string
          status: string
        }
        Insert: {
          attempt_number: number
          completed_at?: string | null
          error_message?: string | null
          id?: string
          publication_job_id: string
          provider_response?: Json | null
          provider_status?: number | null
          started_at?: string
          status: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          error_message?: string | null
          id?: string
          publication_job_id?: string
          provider_response?: Json | null
          provider_status?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      publication_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          linkedin_post_urn: string | null
          post_id: string | null
          schedule_id: string | null
          scheduled_for: string | null
          started_at: string | null
          status: string
          target_id: string | null
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          last_attempt_at?: string | null
          linkedin_post_urn?: string | null
          post_id?: string | null
          schedule_id?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          target_id?: string | null
          topic_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          linkedin_post_urn?: string | null
          post_id?: string | null
          schedule_id?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          target_id?: string | null
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          attempt_count: number
          content: string
          content_hash: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          image_url: string | null
          last_attempt_at: string | null
          linkedin_post_id: string | null
          news_summary: string | null
          published_at: string | null
          schedule_id: string | null
          scheduled_at: string | null
          status: string
          target_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          attempt_count?: number
          content: string
          content_hash?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          last_attempt_at?: string | null
          linkedin_post_id?: string | null
          news_summary?: string | null
          published_at?: string | null
          schedule_id?: string | null
          scheduled_at?: string | null
          status?: string
          target_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          attempt_count?: number
          content?: string
          content_hash?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          last_attempt_at?: string | null
          linkedin_post_id?: string | null
          news_summary?: string | null
          published_at?: string | null
          schedule_id?: string | null
          scheduled_at?: string | null
          status?: string
          target_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "linkedin_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schedule_runs: {
        Row: {
          attempt: number
          created_at: string
          id: string
          message: string | null
          post_id: string | null
          schedule_id: string
          source: string
          status: string
          target_id: string | null
          user_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          id?: string
          message?: string | null
          post_id?: string | null
          schedule_id: string
          source?: string
          status?: string
          target_id?: string | null
          user_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          id?: string
          message?: string | null
          post_id?: string | null
          schedule_id?: string
          source?: string
          status?: string
          target_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          adhoc_sources: Json
          ai_model: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          days_of_week: number[]
          enabled: boolean
          hour: number
          id: string
          image_mode: string
          image_prompt: string | null
          language: string
          last_run_at: string | null
          minute: number
          name: string
          next_run_at: string | null
          prompt: string
          recent_hashes: string[]
          saved_source_ids: string[]
          target_ids: string[]
          timezone: string
          tone_instructions: string | null
          updated_at: string
          used_urls: string[]
          user_id: string
        }
        Insert: {
          adhoc_sources?: Json
          ai_model?: string | null
          created_at?: string
          days_of_week?: number[]
          enabled?: boolean
          hour?: number
          id?: string
          image_mode?: string
          image_prompt?: string | null
          language?: string
          last_run_at?: string | null
          minute?: number
          name: string
          next_run_at?: string | null
          prompt?: string
          recent_hashes?: string[]
          saved_source_ids?: string[]
          target_ids?: string[]
          timezone?: string
          tone_instructions?: string | null
          updated_at?: string
          used_urls?: string[]
          user_id: string
        }
        Update: {
          adhoc_sources?: Json
          ai_model?: string | null
          created_at?: string
          days_of_week?: number[]
          enabled?: boolean
          hour?: number
          id?: string
          image_mode?: string
          image_prompt?: string | null
          language?: string
          last_run_at?: string | null
          minute?: number
          name?: string
          next_run_at?: string | null
          prompt?: string
          recent_hashes?: string[]
          saved_source_ids?: string[]
          target_ids?: string[]
          timezone?: string
          tone_instructions?: string | null
          updated_at?: string
          used_urls?: string[]
          user_id?: string
        }
        Relationships: []
      }
      topic_queue: {
        Row: {
          created_at: string
          error: string | null
          id: string
          include_image: boolean
          language: string
          post_id: string | null
          processed_at: string | null
          scheduled_at: string
          status: string
          subject: string
          target_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          include_image?: boolean
          language?: string
          post_id?: string | null
          processed_at?: string | null
          scheduled_at: string
          status?: string
          subject: string
          target_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          include_image?: boolean
          language?: string
          post_id?: string | null
          processed_at?: string | null
          scheduled_at?: string
          status?: string
          subject?: string
          target_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_queue_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          anthropic_api_key: string | null
          created_at: string
          deepseek_api_key: string | null
          firecrawl_api_key: string | null
          gemini_api_key: string | null
          groq_api_key: string | null
          image_model: string
          linkedin_access_token: string | null
          linkedin_client_id: string | null
          linkedin_client_secret: string | null
          linkedin_organization_id: string | null
          linkedin_person_urn: string | null
          linkedin_token_expires_at: string | null
          mistral_api_key: string | null
          openai_api_key: string | null
          openrouter_api_key: string | null
          perplexity_api_key: string | null
          post_model: string
          tone_instructions: string | null
          updated_at: string
          use_byok: boolean
          user_id: string
          xai_api_key: string | null
          has_linkedin_client_secret: boolean | null
          has_openai_api_key: boolean | null
          has_gemini_api_key: boolean | null
          has_anthropic_api_key: boolean | null
          has_mistral_api_key: boolean | null
          has_groq_api_key: boolean | null
          has_deepseek_api_key: boolean | null
          has_xai_api_key: boolean | null
          has_perplexity_api_key: boolean | null
          has_openrouter_api_key: boolean | null
          has_firecrawl_api_key: boolean | null
        }
        Insert: {
          anthropic_api_key?: string | null
          created_at?: string
          deepseek_api_key?: string | null
          firecrawl_api_key?: string | null
          gemini_api_key?: string | null
          groq_api_key?: string | null
          image_model?: string
          linkedin_access_token?: string | null
          linkedin_client_id?: string | null
          linkedin_client_secret?: string | null
          linkedin_organization_id?: string | null
          linkedin_person_urn?: string | null
          linkedin_token_expires_at?: string | null
          mistral_api_key?: string | null
          openai_api_key?: string | null
          openrouter_api_key?: string | null
          perplexity_api_key?: string | null
          post_model?: string
          tone_instructions?: string | null
          updated_at?: string
          use_byok?: boolean
          user_id: string
          xai_api_key?: string | null
        }
        Update: {
          anthropic_api_key?: string | null
          created_at?: string
          deepseek_api_key?: string | null
          firecrawl_api_key?: string | null
          gemini_api_key?: string | null
          groq_api_key?: string | null
          image_model?: string
          linkedin_access_token?: string | null
          linkedin_client_id?: string | null
          linkedin_client_secret?: string | null
          linkedin_organization_id?: string | null
          linkedin_person_urn?: string | null
          linkedin_token_expires_at?: string | null
          mistral_api_key?: string | null
          openai_api_key?: string | null
          openrouter_api_key?: string | null
          perplexity_api_key?: string | null
          post_model?: string
          tone_instructions?: string | null
          updated_at?: string
          use_byok?: boolean
          user_id?: string
          xai_api_key?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
