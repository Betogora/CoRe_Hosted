export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_user_id?: string | null
        }
        Relationships: []
      }
      ai_jobs: {
        Row: {
          attempt_count: number
          contract_version: number
          cost_currency: string | null
          cost_micros: number | null
          created_at: string
          deck_id: string | null
          deleted_at: string | null
          error: Json | null
          error_class: string | null
          error_code: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          input_ref: Json
          input_tokens: number | null
          job_type: string
          max_attempts: number
          model: string | null
          next_retry_at: string | null
          output_tokens: number | null
          policy: Json
          pricing_version: string | null
          prompt_version: string | null
          provider: string | null
          request_fingerprint: string | null
          result_ref: Json | null
          retryable: boolean
          revision: number
          schema_version: string | null
          started_at: string | null
          status: string
          total_tokens: number | null
          updated_at: string
          updated_by_device_id: string | null
          user_id: string
        }
        Insert: {
          attempt_count?: number
          contract_version?: number
          cost_currency?: string | null
          cost_micros?: number | null
          created_at?: string
          deck_id?: string | null
          deleted_at?: string | null
          error?: Json | null
          error_class?: string | null
          error_code?: string | null
          finished_at?: string | null
          id: string
          idempotency_key?: string | null
          input_ref?: Json
          input_tokens?: number | null
          job_type: string
          max_attempts?: number
          model?: string | null
          next_retry_at?: string | null
          output_tokens?: number | null
          policy?: Json
          pricing_version?: string | null
          prompt_version?: string | null
          provider?: string | null
          request_fingerprint?: string | null
          result_ref?: Json | null
          retryable?: boolean
          revision?: number
          schema_version?: string | null
          started_at?: string | null
          status?: string
          total_tokens?: number | null
          updated_at?: string
          updated_by_device_id?: string | null
          user_id: string
        }
        Update: {
          attempt_count?: number
          contract_version?: number
          cost_currency?: string | null
          cost_micros?: number | null
          created_at?: string
          deck_id?: string | null
          deleted_at?: string | null
          error?: Json | null
          error_class?: string | null
          error_code?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          input_ref?: Json
          input_tokens?: number | null
          job_type?: string
          max_attempts?: number
          model?: string | null
          next_retry_at?: string | null
          output_tokens?: number | null
          policy?: Json
          pricing_version?: string | null
          prompt_version?: string | null
          provider?: string | null
          request_fingerprint?: string | null
          result_ref?: Json | null
          retryable?: boolean
          revision?: number
          schema_version?: string | null
          started_at?: string | null
          status?: string
          total_tokens?: number | null
          updated_at?: string
          updated_by_device_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_deck_owner_fk"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      apkg_import_jobs: {
        Row: {
          attempt_count: number
          cancel_requested_at: string | null
          created_at: string
          error_class: string | null
          error_code: string | null
          execution_ref: string | null
          expires_at: string
          file_name: string
          file_size: number
          finished_at: string | null
          id: string
          max_attempts: number
          phase: string
          progress_completed: number
          progress_total: number
          report: Json
          result_path: string | null
          retryable: boolean
          revision: number
          source_path: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          cancel_requested_at?: string | null
          created_at?: string
          error_class?: string | null
          error_code?: string | null
          execution_ref?: string | null
          expires_at?: string
          file_name: string
          file_size: number
          finished_at?: string | null
          id: string
          max_attempts?: number
          phase?: string
          progress_completed?: number
          progress_total?: number
          report?: Json
          result_path?: string | null
          retryable?: boolean
          revision?: number
          source_path: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          cancel_requested_at?: string | null
          created_at?: string
          error_class?: string | null
          error_code?: string | null
          execution_ref?: string | null
          expires_at?: string
          file_name?: string
          file_size?: number
          finished_at?: string | null
          id?: string
          max_attempts?: number
          phase?: string
          progress_completed?: number
          progress_total?: number
          report?: Json
          result_path?: string | null
          retryable?: boolean
          revision?: number
          source_path?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      card_variants: {
        Row: {
          anchor_variant_id: string | null
          answer_options_json: Json | null
          back: string
          card_id: string
          changed_recognition_cues: string[]
          confidence: number | null
          content_hash: string | null
          created_at: string
          deleted_at: string | null
          expected_answer_json: Json | null
          explanation: string
          feedback: Json
          front: string
          generation_source: string
          hints_json: Json | null
          id: string
          is_active: boolean
          is_original: boolean
          meta: Json
          model_run_id: string | null
          parent_variant_id: string | null
          performance: Json
          quality_status: string
          review_state: Json
          revision: number
          semantic_delta: string | null
          source_anchors: Json
          source_card_id: string
          transform_profile: Json
          transform_type: string
          updated_at: string
          updated_by_device_id: string | null
          user_id: string
          variant_level: number
          variant_type: string
          version_log: Json
        }
        Insert: {
          anchor_variant_id?: string | null
          answer_options_json?: Json | null
          back?: string
          card_id: string
          changed_recognition_cues?: string[]
          confidence?: number | null
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          expected_answer_json?: Json | null
          explanation?: string
          feedback?: Json
          front?: string
          generation_source?: string
          hints_json?: Json | null
          id: string
          is_active?: boolean
          is_original?: boolean
          meta?: Json
          model_run_id?: string | null
          parent_variant_id?: string | null
          performance?: Json
          quality_status?: string
          review_state?: Json
          revision?: number
          semantic_delta?: string | null
          source_anchors?: Json
          source_card_id: string
          transform_profile?: Json
          transform_type: string
          updated_at?: string
          updated_by_device_id?: string | null
          user_id: string
          variant_level?: number
          variant_type?: string
          version_log?: Json
        }
        Update: {
          anchor_variant_id?: string | null
          answer_options_json?: Json | null
          back?: string
          card_id?: string
          changed_recognition_cues?: string[]
          confidence?: number | null
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          expected_answer_json?: Json | null
          explanation?: string
          feedback?: Json
          front?: string
          generation_source?: string
          hints_json?: Json | null
          id?: string
          is_active?: boolean
          is_original?: boolean
          meta?: Json
          model_run_id?: string | null
          parent_variant_id?: string | null
          performance?: Json
          quality_status?: string
          review_state?: Json
          revision?: number
          semantic_delta?: string | null
          source_anchors?: Json
          source_card_id?: string
          transform_profile?: Json
          transform_type?: string
          updated_at?: string
          updated_by_device_id?: string | null
          user_id?: string
          variant_level?: number
          variant_type?: string
          version_log?: Json
        }
        Relationships: [
          {
            foreignKeyName: "card_variants_card_owner_fk"
            columns: ["card_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      cards: {
        Row: {
          content_hash: string | null
          core_state: Json
          created_at: string
          deck_id: string
          deleted_at: string | null
          draft_status: string
          id: string
          immutable_original: Json
          kind: string
          media_refs: string[]
          meta: Json
          note_id: string | null
          original_back: string
          original_fields: Json
          original_front: string
          original_html: string
          original_tags: string[]
          review_state: Json
          revision: number
          source: string
          source_anchors: Json
          source_card_id: string | null
          source_note_id: string | null
          status: string
          updated_at: string
          updated_by_device_id: string | null
          user_id: string
          version_log: Json
        }
        Insert: {
          content_hash?: string | null
          core_state?: Json
          created_at?: string
          deck_id: string
          deleted_at?: string | null
          draft_status?: string
          id: string
          immutable_original?: Json
          kind: string
          media_refs?: string[]
          meta?: Json
          note_id?: string | null
          original_back?: string
          original_fields?: Json
          original_front?: string
          original_html?: string
          original_tags?: string[]
          review_state?: Json
          revision?: number
          source: string
          source_anchors?: Json
          source_card_id?: string | null
          source_note_id?: string | null
          status?: string
          updated_at?: string
          updated_by_device_id?: string | null
          user_id: string
          version_log?: Json
        }
        Update: {
          content_hash?: string | null
          core_state?: Json
          created_at?: string
          deck_id?: string
          deleted_at?: string | null
          draft_status?: string
          id?: string
          immutable_original?: Json
          kind?: string
          media_refs?: string[]
          meta?: Json
          note_id?: string | null
          original_back?: string
          original_fields?: Json
          original_front?: string
          original_html?: string
          original_tags?: string[]
          review_state?: Json
          revision?: number
          source?: string
          source_anchors?: Json
          source_card_id?: string | null
          source_note_id?: string | null
          status?: string
          updated_at?: string
          updated_by_device_id?: string | null
          user_id?: string
          version_log?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cards_deck_owner_fk"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      core_portable_exports: {
        Row: {
          content_hash: string | null
          id: string
          imported_at: string
          owner_label: string | null
          payload: Json
          source_label: string
          user_id: string | null
        }
        Insert: {
          content_hash?: string | null
          id?: string
          imported_at?: string
          owner_label?: string | null
          payload: Json
          source_label?: string
          user_id?: string | null
        }
        Update: {
          content_hash?: string | null
          id?: string
          imported_at?: string
          owner_label?: string | null
          payload?: Json
          source_label?: string
          user_id?: string | null
        }
        Relationships: []
      }
      decks: {
        Row: {
          card_count: number
          community_refs: Json
          created_at: string
          deck_settings: Json
          deleted_at: string | null
          description: string
          graph: Json | null
          hierarchy_path: string[]
          id: string
          import_meta: Json
          local_owner_id: string | null
          name: string
          original_deck_id: string | null
          parent_deck_id: string | null
          revision: number
          source: string
          tags: string[]
          updated_at: string
          updated_by_device_id: string | null
          user_id: string
          version_log: Json
          visibility: string
        }
        Insert: {
          card_count?: number
          community_refs?: Json
          created_at?: string
          deck_settings?: Json
          deleted_at?: string | null
          description?: string
          graph?: Json | null
          hierarchy_path?: string[]
          id: string
          import_meta?: Json
          local_owner_id?: string | null
          name: string
          original_deck_id?: string | null
          parent_deck_id?: string | null
          revision?: number
          source: string
          tags?: string[]
          updated_at?: string
          updated_by_device_id?: string | null
          user_id: string
          version_log?: Json
          visibility?: string
        }
        Update: {
          card_count?: number
          community_refs?: Json
          created_at?: string
          deck_settings?: Json
          deleted_at?: string | null
          description?: string
          graph?: Json | null
          hierarchy_path?: string[]
          id?: string
          import_meta?: Json
          local_owner_id?: string | null
          name?: string
          original_deck_id?: string | null
          parent_deck_id?: string | null
          revision?: number
          source?: string
          tags?: string[]
          updated_at?: string
          updated_by_device_id?: string | null
          user_id?: string
          version_log?: Json
          visibility?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          card_id: string | null
          created_at: string
          deck_id: string
          deleted_at: string | null
          id: string
          metadata: Json
          mime_type: string
          original_name: string
          sha1: string
          size: number
          source: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id?: string | null
          created_at?: string
          deck_id: string
          deleted_at?: string | null
          id: string
          metadata?: Json
          mime_type?: string
          original_name: string
          sha1: string
          size?: number
          source?: string
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string | null
          created_at?: string
          deck_id?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          mime_type?: string
          original_name?: string
          sha1?: string
          size?: number
          source?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_card_deck_owner_fk"
            columns: ["card_id", "deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id", "deck_id", "user_id"]
          },
          {
            foreignKeyName: "media_assets_deck_owner_fk"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          field_of_study: string | null
          id: string
          onboarding_complete: boolean
          preferred_language: string
          privacy: Json
          scheduler_preferences: Json
          timezone: string
          university: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          field_of_study?: string | null
          id: string
          onboarding_complete?: boolean
          preferred_language?: string
          privacy?: Json
          scheduler_preferences?: Json
          timezone?: string
          university?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          field_of_study?: string | null
          id?: string
          onboarding_complete?: boolean
          preferred_language?: string
          privacy?: Json
          scheduler_preferences?: Json
          timezone?: string
          university?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      review_events: {
        Row: {
          answered_at: string
          created_at: string
          created_by_device_id: string | null
          deck_id: string
          flags: Json
          id: string
          rating: string
          response_time_ms: number | null
          reviewable_id: string
          reviewable_type: string
          scheduler_after: Json | null
          scheduler_before: Json | null
          source_card_id: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string
          created_at?: string
          created_by_device_id?: string | null
          deck_id: string
          flags?: Json
          id: string
          rating: string
          response_time_ms?: number | null
          reviewable_id: string
          reviewable_type: string
          scheduler_after?: Json | null
          scheduler_before?: Json | null
          source_card_id?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string
          created_at?: string
          created_by_device_id?: string | null
          deck_id?: string
          flags?: Json
          id?: string
          rating?: string
          response_time_ms?: number | null
          reviewable_id?: string
          reviewable_type?: string
          scheduler_after?: Json | null
          scheduler_before?: Json | null
          source_card_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_events_deck_owner_fk"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      source_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_name: string
          id: string
          local_owner_id: string | null
          metadata: Json
          mime_type: string
          revision: number
          storage_url: string
          text: string
          text_extraction_status: string
          updated_at: string
          updated_by_device_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_name: string
          id: string
          local_owner_id?: string | null
          metadata?: Json
          mime_type?: string
          revision?: number
          storage_url?: string
          text?: string
          text_extraction_status?: string
          updated_at?: string
          updated_by_device_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          id?: string
          local_owner_id?: string | null
          metadata?: Json
          mime_type?: string
          revision?: number
          storage_url?: string
          text?: string
          text_extraction_status?: string
          updated_at?: string
          updated_by_device_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sync_conflicts: {
        Row: {
          base_revision: number | null
          created_at: string
          entity_id: string
          entity_table: string
          id: string
          local_revision: number | null
          local_value: Json
          remote_revision: number | null
          remote_value: Json
          resolution: Json
          resolved_at: string | null
          status: string
          updated_by_device_id: string | null
          user_id: string
        }
        Insert: {
          base_revision?: number | null
          created_at?: string
          entity_id: string
          entity_table: string
          id: string
          local_revision?: number | null
          local_value?: Json
          remote_revision?: number | null
          remote_value?: Json
          resolution?: Json
          resolved_at?: string | null
          status?: string
          updated_by_device_id?: string | null
          user_id: string
        }
        Update: {
          base_revision?: number | null
          created_at?: string
          entity_id?: string
          entity_table?: string
          id?: string
          local_revision?: number | null
          local_value?: Json
          remote_revision?: number | null
          remote_value?: Json
          resolution?: Json
          resolved_at?: string | null
          status?: string
          updated_by_device_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sync_devices: {
        Row: {
          created_at: string
          id: string
          label: string
          last_seen_at: string
          user_agent: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          label?: string
          last_seen_at?: string
          user_agent?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_seen_at?: string
          user_agent?: string
          user_id?: string
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
    Enums: {},
  },
} as const
