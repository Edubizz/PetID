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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      appointments: {
        Row: {
          clinic: string | null
          created_at: string
          id: string
          notes: string | null
          pet_id: string
          reason: string | null
          scheduled_at: string
          vet_name: string | null
        }
        Insert: {
          clinic?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pet_id: string
          reason?: string | null
          scheduled_at: string
          vet_name?: string | null
        }
        Update: {
          clinic?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pet_id?: string
          reason?: string | null
          scheduled_at?: string
          vet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      caretakers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          pet_id: string
          phone: string | null
          relationship: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          pet_id: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          pet_id?: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caretakers_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string | null
          created_at: string
          id: string
          pet_id: string
          title: string
          url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          pet_id: string
          title: string
          url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          pet_id?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_scans: {
        Row: {
          created_at: string
          id: string
          pet_id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pet_id: string
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pet_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_scans_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          allergies: string | null
          birth_date: string | null
          breed: string | null
          color: string | null
          created_at: string
          id: string
          is_lost: boolean
          is_verified: boolean
          kennel: string | null
          last_seen_location: string | null
          lost_since: string | null
          medical_notes: string | null
          medications: string | null
          microchip: string | null
          name: string
          owner_id: string
          pedigree: string | null
          photo_url: string | null
          public_slug: string
          secondary_contact_name: string | null
          secondary_contact_phone: string | null
          sex: string | null
          show_medical_public: boolean
          species: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          allergies?: string | null
          birth_date?: string | null
          breed?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_lost?: boolean
          is_verified?: boolean
          kennel?: string | null
          last_seen_location?: string | null
          lost_since?: string | null
          medical_notes?: string | null
          medications?: string | null
          microchip?: string | null
          name: string
          owner_id: string
          pedigree?: string | null
          photo_url?: string | null
          public_slug?: string
          secondary_contact_name?: string | null
          secondary_contact_phone?: string | null
          sex?: string | null
          show_medical_public?: boolean
          species?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          allergies?: string | null
          birth_date?: string | null
          breed?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_lost?: boolean
          is_verified?: boolean
          kennel?: string | null
          last_seen_location?: string | null
          lost_since?: string | null
          medical_notes?: string | null
          medications?: string | null
          microchip?: string | null
          name?: string
          owner_id?: string
          pedigree?: string | null
          photo_url?: string | null
          public_slug?: string
          secondary_contact_name?: string | null
          secondary_contact_phone?: string | null
          sex?: string | null
          show_medical_public?: boolean
          species?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_blocked: boolean
          phone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_blocked?: boolean
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      sightings: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          id: string
          location: string | null
          message: string | null
          notified_email_at: string | null
          notified_push_at: string | null
          notified_whatsapp_at: string | null
          pet_id: string
          reporter_contact: string | null
          reporter_name: string | null
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          location?: string | null
          message?: string | null
          notified_email_at?: string | null
          notified_push_at?: string | null
          notified_whatsapp_at?: string | null
          pet_id: string
          reporter_contact?: string | null
          reporter_name?: string | null
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          location?: string | null
          message?: string | null
          notified_email_at?: string | null
          notified_push_at?: string | null
          notified_whatsapp_at?: string | null
          pet_id?: string
          reporter_contact?: string | null
          reporter_name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sightings_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vaccines: {
        Row: {
          applied_at: string | null
          created_at: string
          id: string
          name: string
          next_dose: string | null
          notes: string | null
          pet_id: string
          vet_name: string | null
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          id?: string
          name: string
          next_dose?: string | null
          notes?: string | null
          pet_id: string
          vet_name?: string | null
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          id?: string
          name?: string
          next_dose?: string | null
          notes?: string | null
          pet_id?: string
          vet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vaccines_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          created_at: string
          documents: Json
          id: string
          notes: string | null
          pet_id: string
          requester_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          documents?: Json
          id?: string
          notes?: string | null
          pet_id: string
          requester_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          documents?: Json
          id?: string
          notes?: string | null
          pet_id?: string
          requester_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_history: {
        Row: {
          created_at: string
          id: string
          measured_at: string
          notes: string | null
          pet_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at?: string
          notes?: string | null
          pet_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string
          notes?: string | null
          pet_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_history_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_exists: { Args: never; Returns: boolean }
      admin_list_pets: {
        Args: never
        Returns: {
          breed: string
          created_at: string
          id: string
          is_lost: boolean
          is_verified: boolean
          last_scan_at: string
          name: string
          owner_email: string
          owner_id: string
          owner_name: string
          photo_url: string
          public_slug: string
          scans_count: number
          sightings_count: number
          species: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          last_sign_in_at: string
          pets_count: number
          phone: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      admin_list_verifications: {
        Args: never
        Returns: {
          created_at: string
          documents: Json
          id: string
          notes: string
          pet_id: string
          pet_name: string
          pet_photo: string
          requester_email: string
          requester_id: string
          requester_name: string
          reviewed_at: string
          status: string
        }[]
      }
      admin_monthly_stats: {
        Args: never
        Returns: {
          month: string
          new_pets: number
          new_users: number
          scans: number
          sightings: number
        }[]
      }
      admin_resolve_lost: { Args: { _pet_id: string }; Returns: undefined }
      admin_review_verification: {
        Args: { _notes?: string; _request_id: string; _status: string }
        Returns: undefined
      }
      admin_set_user_blocked: {
        Args: { _blocked: boolean; _user_id: string }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: {
          _enabled: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      claim_first_admin: { Args: never; Returns: boolean }
      get_admin_stats: { Args: never; Returns: Json }
      get_public_pet: {
        Args: { _slug: string }
        Returns: {
          allergies: string
          birth_date: string
          breed: string
          color: string
          id: string
          is_lost: boolean
          last_seen_location: string
          medical_notes: string
          medications: string
          microchip: string
          name: string
          photo_url: string
          public_slug: string
          secondary_contact_phone: string
          sex: string
          show_medical_public: boolean
          species: string
          weight_kg: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      pet_exists: { Args: { _pet_id: string }; Returns: boolean }
      pet_exists_and_lost: { Args: { _pet_id: string }; Returns: boolean }
      record_pet_scan: {
        Args: { _slug: string; _source?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
