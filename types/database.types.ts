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
      admin_change_log: {
        Row: {
          actor_id: string
          created_at: string
          field_name: string
          id: number
          new_value: string | null
          old_value: string | null
          product_id: string
          sku: string | null
          source: string
          variant_id: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          field_name: string
          id?: never
          new_value?: string | null
          old_value?: string | null
          product_id: string
          sku?: string | null
          source: string
          variant_id?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          field_name?: string
          id?: never
          new_value?: string | null
          old_value?: string | null
          product_id?: string
          sku?: string | null
          source?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_change_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_change_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_change_log_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          market_id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          market_id: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          market_id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      colors: {
        Row: {
          hex_code: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          hex_code: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          hex_code?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          market_id: string
          name: string | null
          notes: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          market_id: string
          name?: string | null
          notes?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          market_id?: string
          name?: string | null
          notes?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      home_content: {
        Row: {
          created_at: string
          cta_href: string | null
          cta_label: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          market_id: string
          section: string
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          market_id: string
          section: string
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          market_id?: string
          section?: string
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_content_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          currency_code: string
          id: string
          is_active: boolean
          locale: string
          name: string
        }
        Insert: {
          currency_code: string
          id: string
          is_active?: boolean
          locale: string
          name: string
        }
        Update: {
          currency_code?: string
          id?: string
          is_active?: boolean
          locale?: string
          name?: string
        }
        Relationships: []
      }
      order_counters: {
        Row: {
          last_number: number
          market_id: string
        }
        Insert: {
          last_number?: number
          market_id: string
        }
        Update: {
          last_number?: number
          market_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_counters_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: true
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          color_name: string | null
          id: string
          line_total: number
          order_id: string
          product_name: string
          quantity: number
          size_label: string | null
          sku: string | null
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          color_name?: string | null
          id?: string
          line_total: number
          order_id: string
          product_name: string
          quantity: number
          size_label?: string | null
          sku?: string | null
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          color_name?: string | null
          id?: string
          line_total?: number
          order_id?: string
          product_name?: string
          quantity?: number
          size_label?: string | null
          sku?: string | null
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notes: {
        Row: {
          actor_id: string
          body: string
          created_at: string
          id: string
          order_id: string
        }
        Insert: {
          actor_id?: string
          body: string
          created_at?: string
          id?: string
          order_id: string
        }
        Update: {
          actor_id?: string
          body?: string
          created_at?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          channel: string
          client_request_fingerprint: string | null
          client_request_id: string | null
          created_at: string
          currency_code: string
          customer_id: string
          discount_total: number
          id: string
          market_id: string
          notes: string | null
          order_number: string
          shipping_address: Json | null
          shipping_total: number
          source_url: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          channel: string
          client_request_fingerprint?: string | null
          client_request_id?: string | null
          created_at?: string
          currency_code: string
          customer_id: string
          discount_total?: number
          id?: string
          market_id: string
          notes?: string | null
          order_number: string
          shipping_address?: Json | null
          shipping_total?: number
          source_url?: string | null
          status?: string
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          channel?: string
          client_request_fingerprint?: string | null
          client_request_id?: string | null
          created_at?: string
          currency_code?: string
          customer_id?: string
          discount_total?: number
          id?: string
          market_id?: string
          notes?: string | null
          order_number?: string
          shipping_address?: Json | null
          shipping_total?: number
          source_url?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string
          blur_data_url: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt_text: string
          blur_data_url?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt_text?: string
          blur_data_url?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color_id: string | null
          compare_at_price: number | null
          created_at: string
          id: string
          is_active: boolean
          is_low_stock: boolean | null
          low_stock_threshold: number
          price: number
          product_id: string
          size_id: string | null
          sku: string
          stock: number
          updated_at: string
        }
        Insert: {
          color_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_low_stock?: boolean | null
          low_stock_threshold?: number
          price: number
          product_id: string
          size_id?: string | null
          sku: string
          stock?: number
          updated_at?: string
        }
        Update: {
          color_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_low_stock?: boolean | null
          low_stock_threshold?: number
          price?: number
          product_id?: string
          size_id?: string | null
          sku?: string
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          care_instructions: string | null
          category_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_featured: boolean
          is_new: boolean
          market_id: string
          materials: string | null
          meta_description: string | null
          meta_title: string | null
          name: string
          shipping_info_override: string | null
          short_description: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          care_instructions?: string | null
          category_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean
          is_new?: boolean
          market_id: string
          materials?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          shipping_info_override?: string | null
          short_description?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          care_instructions?: string | null
          category_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean
          is_new?: boolean
          market_id?: string
          materials?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          shipping_info_override?: string | null
          short_description?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      promotion_categories: {
        Row: {
          category_id: string
          promotion_id: string
        }
        Insert: {
          category_id: string
          promotion_id: string
        }
        Update: {
          category_id?: string
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_categories_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_products: {
        Row: {
          product_id: string
          promotion_id: string
        }
        Insert: {
          product_id: string
          promotion_id: string
        }
        Update: {
          product_id?: string
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_products_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          code: string | null
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          market_id: string
          name: string
          scope: string
          starts_at: string | null
          type: string
          updated_at: string
          value: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          market_id: string
          name: string
          scope: string
          starts_at?: string | null
          type: string
          updated_at?: string
          value: number
        }
        Update: {
          code?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          market_id?: string
          name?: string
          scope?: string
          starts_at?: string | null
          type?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          contact_email: string | null
          facebook_url: string | null
          instagram_url: string | null
          logo_url: string | null
          market_id: string
          policies: Json
          store_name: string
          tiktok_url: string | null
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          contact_email?: string | null
          facebook_url?: string | null
          instagram_url?: string | null
          logo_url?: string | null
          market_id: string
          policies?: Json
          store_name: string
          tiktok_url?: string | null
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          contact_email?: string | null
          facebook_url?: string | null
          instagram_url?: string | null
          logo_url?: string | null
          market_id?: string
          policies?: Json
          store_name?: string
          tiktok_url?: string | null
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: true
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          created_at: string
          description: string | null
          free_shipping_threshold: number | null
          id: string
          is_active: boolean
          market_id: string
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          free_shipping_threshold?: number | null
          id?: string
          is_active?: boolean
          market_id: string
          name: string
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          free_shipping_threshold?: number | null
          id?: string
          is_active?: boolean
          market_id?: string
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_methods_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      sizes: {
        Row: {
          id: string
          is_active: boolean
          label: string
          size_group: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          label: string
          size_group: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          label?: string
          size_group?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_variant_matrix: {
        Args: { p_product_id: string; p_variants: Json }
        Returns: Json
      }
      admin_operations_summary: { Args: { p_market_id: string }; Returns: Json }
      admin_restock_variants: {
        Args: { p_items: Json; p_market_id: string }
        Returns: Json
      }
      admin_unsellable_products: {
        Args: { p_limit?: number; p_market_id: string }
        Returns: {
          id: string
          name: string
          reason: string
          slug: string
        }[]
      }
      admin_update_order_status: {
        Args: {
          p_note?: string
          p_order_id: string
          p_payment_confirmed?: boolean
          p_to_status: string
        }
        Returns: Json
      }
      create_order: {
        Args: {
          p_client_request_id: string
          p_customer_name: string
          p_customer_phone: string
          p_items: Json
          p_market_id: string
          p_source_url?: string
        }
        Returns: Json
      }
      is_active_market: { Args: { p_market_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      product_has_active_variant: {
        Args: { p_product_id: string }
        Returns: boolean
      }
      product_is_sellable: { Args: { p_product_id: string }; Returns: boolean }
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
