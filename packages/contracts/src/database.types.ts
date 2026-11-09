// Bootstrap types matching the migration. Regenerate with pnpm db:types after applying it.
export type Database = {
  public: {
    Tables: {
      foundation_jobs: {
        Row: { id: string; owner_id: string; request_key: string; status: string; attempt_count: number; lease_token: string | null; lease_until: string | null; object_key: string | null; error_code: string | null; created_at: string; updated_at: string; completed_at: string | null };
        Insert: never; Update: never; Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      foundation_is_allowed: { Args: Record<string, never>; Returns: boolean };
      foundation_create_job: { Args: { p_request_key: string }; Returns: { id: string; status: string; created: boolean }[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
