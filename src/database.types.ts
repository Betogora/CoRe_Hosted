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
      card_catalog: {
        Row: {
          active_variant_count: number
          active_variant_id: string | null
          body_revision: number
          created_at: string
          deck_id: string
          deleted_at: string | null
          dependency_revision: number
          difficulty: number
          due_at: string | null
          front_preview: string
          has_active_variants: boolean
          id: string
          interval_days: number
          last_reviewed_at: string | null
          maturity_band: string
          normalized_search_text: string
          reviewable: boolean
          schedule_state: string
          sort_text: string
          stability: number
          sync_change_id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_variant_count?: number
          active_variant_id?: string | null
          body_revision?: number
          created_at: string
          deck_id: string
          deleted_at?: string | null
          dependency_revision?: number
          difficulty?: number
          due_at?: string | null
          front_preview?: string
          has_active_variants?: boolean
          id: string
          interval_days?: number
          last_reviewed_at?: string | null
          maturity_band?: string
          normalized_search_text?: string
          reviewable?: boolean
          schedule_state?: string
          sort_text?: string
          stability?: number
          sync_change_id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_variant_count?: number
          active_variant_id?: string | null
          body_revision?: number
          created_at?: string
          deck_id?: string
          deleted_at?: string | null
          dependency_revision?: number
          difficulty?: number
          due_at?: string | null
          front_preview?: string
          has_active_variants?: boolean
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          maturity_band?: string
          normalized_search_text?: string
          reviewable?: boolean
          schedule_state?: string
          sort_text?: string
          stability?: number
          sync_change_id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_catalog_card_owner_fk"
            columns: ["id", "user_id"]
            isOneToOne: true
            referencedRelation: "cards"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "card_catalog_deck_owner_fk"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      card_variants: {
        Row: {
          back: string
          card_id: string
          changed_recognition_cues: string[]
          confidence: number | null
          content_hash: string | null
          created_at: string
          deleted_at: string | null
          explanation: string
          feedback: Json
          front: string
          id: string
          is_active: boolean
          meta: Json
          model_run_id: string | null
          performance: Json
          quality_status: string
          revision: number
          semantic_delta: string | null
          sync_change_id: number
          transform_profile: Json
          transform_type: string
          updated_at: string
          updated_by_device_id: string | null
          user_id: string
          variant_level: number
          variant_type: string
        }
        Insert: {
          back?: string
          card_id: string
          changed_recognition_cues?: string[]
          confidence?: number | null
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          explanation?: string
          feedback?: Json
          front?: string
          id: string
          is_active?: boolean
          meta?: Json
          model_run_id?: string | null
          performance?: Json
          quality_status?: string
          revision?: number
          semantic_delta?: string | null
          sync_change_id?: number
          transform_profile?: Json
          transform_type?: string
          updated_at?: string
          updated_by_device_id?: string | null
          user_id: string
          variant_level?: number
          variant_type?: string
        }
        Update: {
          back?: string
          card_id?: string
          changed_recognition_cues?: string[]
          confidence?: number | null
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          explanation?: string
          feedback?: Json
          front?: string
          id?: string
          is_active?: boolean
          meta?: Json
          model_run_id?: string | null
          performance?: Json
          quality_status?: string
          revision?: number
          semantic_delta?: string | null
          sync_change_id?: number
          transform_profile?: Json
          transform_type?: string
          updated_at?: string
          updated_by_device_id?: string | null
          user_id?: string
          variant_level?: number
          variant_type?: string
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
          content_document: Json
          content_hash: string | null
          content_revision: number
          core_state: Json
          created_at: string
          deck_id: string
          deleted_at: string | null
          draft_status: string
          id: string
          kind: string
          media_refs: string[]
          meta: Json
          note_type_definition_id: string | null
          original_back: string
          original_fields: Json
          original_front: string
          original_html: string
          original_tags: string[]
          projection: Json
          review_state: Json
          revision: number
          source: string
          source_card_id: string | null
          status: string
          sync_change_id: number
          updated_at: string
          updated_by_device_id: string | null
          user_id: string
        }
        Insert: {
          content_document?: Json
          content_hash?: string | null
          content_revision?: number
          core_state?: Json
          created_at?: string
          deck_id: string
          deleted_at?: string | null
          draft_status?: string
          id: string
          kind: string
          media_refs?: string[]
          meta?: Json
          note_type_definition_id?: string | null
          original_back?: string
          original_fields?: Json
          original_front?: string
          original_html?: string
          original_tags?: string[]
          projection?: Json
          review_state?: Json
          revision?: number
          source: string
          source_card_id?: string | null
          status?: string
          sync_change_id?: number
          updated_at?: string
          updated_by_device_id?: string | null
          user_id: string
        }
        Update: {
          content_document?: Json
          content_hash?: string | null
          content_revision?: number
          core_state?: Json
          created_at?: string
          deck_id?: string
          deleted_at?: string | null
          draft_status?: string
          id?: string
          kind?: string
          media_refs?: string[]
          meta?: Json
          note_type_definition_id?: string | null
          original_back?: string
          original_fields?: Json
          original_front?: string
          original_html?: string
          original_tags?: string[]
          projection?: Json
          review_state?: Json
          revision?: number
          source?: string
          source_card_id?: string | null
          status?: string
          sync_change_id?: number
          updated_at?: string
          updated_by_device_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_deck_owner_fk"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "cards_note_type_definition_owner_fk"
            columns: ["note_type_definition_id", "user_id"]
            isOneToOne: false
            referencedRelation: "note_type_definitions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      deck_study_summaries: {
        Row: {
          active_variant_count: number
          deck_id: string
          deleted_at: string | null
          learning_count: number
          mature_count: number
          new_count: number
          suspended_count: number
          sync_change_id: number
          total_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_variant_count?: number
          deck_id: string
          deleted_at?: string | null
          learning_count?: number
          mature_count?: number
          new_count?: number
          suspended_count?: number
          sync_change_id: number
          total_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_variant_count?: number
          deck_id?: string
          deleted_at?: string | null
          learning_count?: number
          mature_count?: number
          new_count?: number
          suspended_count?: number
          sync_change_id?: number
          total_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_study_summaries_deck_owner_fk"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      decks: {
        Row: {
          card_count: number
          created_at: string
          deck_settings: Json
          deleted_at: string | null
          description: string
          hierarchy_path: string[]
          id: string
          import_meta: Json
          local_owner_id: string | null
          name: string
          original_deck_id: string | null
          parent_deck_id: string | null
          revision: number
          source: string
          sync_change_id: number
          tags: string[]
          updated_at: string
          updated_by_device_id: string | null
          user_id: string
        }
        Insert: {
          card_count?: number
          created_at?: string
          deck_settings?: Json
          deleted_at?: string | null
          description?: string
          hierarchy_path?: string[]
          id: string
          import_meta?: Json
          local_owner_id?: string | null
          name: string
          original_deck_id?: string | null
          parent_deck_id?: string | null
          revision?: number
          source: string
          sync_change_id?: number
          tags?: string[]
          updated_at?: string
          updated_by_device_id?: string | null
          user_id: string
        }
        Update: {
          card_count?: number
          created_at?: string
          deck_settings?: Json
          deleted_at?: string | null
          description?: string
          hierarchy_path?: string[]
          id?: string
          import_meta?: Json
          local_owner_id?: string | null
          name?: string
          original_deck_id?: string | null
          parent_deck_id?: string | null
          revision?: number
          source?: string
          sync_change_id?: number
          tags?: string[]
          updated_at?: string
          updated_by_device_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          card_id: string | null
          created_at: string
          deck_id: string | null
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
          deck_id?: string | null
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
          deck_id?: string | null
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
      note_type_definitions: {
        Row: {
          created_at: string
          definition: Json
          deleted_at: string | null
          id: string
          name: string
          revision: number
          sync_change_id: number
          updated_at: string
          updated_by_device_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          definition?: Json
          deleted_at?: string | null
          id: string
          name: string
          revision?: number
          sync_change_id?: number
          updated_at?: string
          updated_by_device_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          definition?: Json
          deleted_at?: string | null
          id?: string
          name?: string
          revision?: number
          sync_change_id?: number
          updated_at?: string
          updated_by_device_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          onboarding_complete: boolean
          scheduler_preferences: Json
          timezone: string
          ui_preferences: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          onboarding_complete?: boolean
          scheduler_preferences?: Json
          timezone?: string
          ui_preferences?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          onboarding_complete?: boolean
          scheduler_preferences?: Json
          timezone?: string
          ui_preferences?: Json
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
          retention_first: boolean
          reviewable_id: string
          reviewable_type: string
          scheduler_after: Json | null
          scheduler_before: Json | null
          source_card_id: string | null
          statistics_category: string
          statistics_day: string
          statistics_hour: number
          statistics_interval_days: number
          sync_change_id: number
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
          retention_first?: boolean
          reviewable_id: string
          reviewable_type: string
          scheduler_after?: Json | null
          scheduler_before?: Json | null
          source_card_id?: string | null
          statistics_category?: string
          statistics_day?: string
          statistics_hour?: number
          statistics_interval_days?: number
          sync_change_id?: number
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
          retention_first?: boolean
          reviewable_id?: string
          reviewable_type?: string
          scheduler_after?: Json | null
          scheduler_before?: Json | null
          source_card_id?: string | null
          statistics_category?: string
          statistics_day?: string
          statistics_hour?: number
          statistics_interval_days?: number
          sync_change_id?: number
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
      review_statistics_daily: {
        Row: {
          day_key: string
          deck_id: string
          duration_learning_ms: number
          duration_mature_ms: number
          duration_ms: number
          duration_relearning_ms: number
          duration_young_ms: number
          hourly_reviews: Json
          hourly_successful: Json
          learning_count: number
          mature_count: number
          rating_counts: Json
          relearning_count: number
          retention_mature_count: number
          retention_mature_remembered: number
          retention_young_count: number
          retention_young_remembered: number
          review_count: number
          successful_count: number
          timed_count: number
          user_id: string
          young_count: number
        }
        Insert: {
          day_key: string
          deck_id: string
          duration_learning_ms?: number
          duration_mature_ms?: number
          duration_ms?: number
          duration_relearning_ms?: number
          duration_young_ms?: number
          hourly_reviews?: Json
          hourly_successful?: Json
          learning_count?: number
          mature_count?: number
          rating_counts?: Json
          relearning_count?: number
          retention_mature_count?: number
          retention_mature_remembered?: number
          retention_young_count?: number
          retention_young_remembered?: number
          review_count?: number
          successful_count?: number
          timed_count?: number
          user_id: string
          young_count?: number
        }
        Update: {
          day_key?: string
          deck_id?: string
          duration_learning_ms?: number
          duration_mature_ms?: number
          duration_ms?: number
          duration_relearning_ms?: number
          duration_young_ms?: number
          hourly_reviews?: Json
          hourly_successful?: Json
          learning_count?: number
          mature_count?: number
          rating_counts?: Json
          relearning_count?: number
          retention_mature_count?: number
          retention_mature_remembered?: number
          retention_young_count?: number
          retention_young_remembered?: number
          review_count?: number
          successful_count?: number
          timed_count?: number
          user_id?: string
          young_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_statistics_daily_deck_owner_fk"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
        ]
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
      delete_account_deck_tree: {
        Args: { p_deck_id: string; p_deleted_at?: string; p_device_id?: string }
        Returns: Json
      }
      get_account_bootstrap_v2: {
        Args: { p_cursor?: string; p_limit?: number; p_max_bytes?: number }
        Returns: Json
      }
      get_account_statistics: {
        Args: {
          p_day_start_hour?: number
          p_deck_ids?: string[]
          p_from?: string
          p_time_zone?: string
          p_to?: string
        }
        Returns: Json
      }
      get_deck_offline_manifest: {
        Args: { p_cursor?: string; p_deck_id: string; p_limit?: number }
        Returns: Json
      }
      hydrate_account_cards: { Args: { p_card_ids: string[] }; Returns: Json }
      list_account_card_catalog: {
        Args: {
          p_cursor?: Json
          p_deck_id: string
          p_include_total?: boolean
          p_limit?: number
          p_query?: string
          p_sort_direction?: string
          p_sort_field?: string
        }
        Returns: Json
      }
      pull_account_catalog_delta: {
        Args: { p_cursor?: number; p_limit?: number; p_max_bytes?: number }
        Returns: Json
      }
      record_review_atomic: {
        Args: {
          p_card_core_state: Json
          p_card_id: string
          p_card_review_state: Json
          p_card_updated_at: string
          p_deck_id: string
          p_device_id: string
          p_event: Json
          p_variant_id: string
          p_variant_performance: Json
          p_variant_updated_at: string
        }
        Returns: Json
      }
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
