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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          app_version: string
          backup_status: string | null
          environment: string
          id: boolean
          last_backup_at: string | null
          last_backup_note: string | null
          last_restore_test_at: string | null
          schema_version: string
          updated_at: string
        }
        Insert: {
          app_version?: string
          backup_status?: string | null
          environment?: string
          id?: boolean
          last_backup_at?: string | null
          last_backup_note?: string | null
          last_restore_test_at?: string | null
          schema_version?: string
          updated_at?: string
        }
        Update: {
          app_version?: string
          backup_status?: string | null
          environment?: string
          id?: boolean
          last_backup_at?: string | null
          last_backup_note?: string | null
          last_restore_test_at?: string | null
          schema_version?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      cash_closings: {
        Row: {
          actual_balance: number
          closed_at: string
          closed_by: string | null
          closing_date: string
          closing_number: string
          difference: number
          expected_balance: number
          financial_account_id: string
          id: string
          notes: string | null
          status: string
        }
        Insert: {
          actual_balance: number
          closed_at?: string
          closed_by?: string | null
          closing_date?: string
          closing_number?: string
          difference: number
          expected_balance: number
          financial_account_id: string
          id?: string
          notes?: string | null
          status?: string
        }
        Update: {
          actual_balance?: number
          closed_at?: string
          closed_by?: string | null
          closing_date?: string
          closing_number?: string
          difference?: number
          expected_balance?: number
          financial_account_id?: string
          id?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_closings_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "cash_closings_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_balance_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          signed_amount: number | null
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          signed_amount?: number | null
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          signed_amount?: number | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_balance_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_balance_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_balance_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_performance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_balance_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_receivables"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_balance_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          customer_number: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_number?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_number?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      exchange_items: {
        Row: {
          color_snapshot: string | null
          condition: string
          created_at: string
          exchange_id: string
          id: string
          item_type: string
          product_name_snapshot: string
          quantity: number
          sale_item_id: string | null
          size_snapshot: string | null
          total_amount: number
          unit_cost: number
          unit_price: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Insert: {
          color_snapshot?: string | null
          condition?: string
          created_at?: string
          exchange_id: string
          id?: string
          item_type: string
          product_name_snapshot: string
          quantity: number
          sale_item_id?: string | null
          size_snapshot?: string | null
          total_amount?: number
          unit_cost: number
          unit_price: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Update: {
          color_snapshot?: string | null
          condition?: string
          created_at?: string
          exchange_id?: string
          id?: string
          item_type?: string
          product_name_snapshot?: string
          quantity?: number
          sale_item_id?: string | null
          size_snapshot?: string | null
          total_amount?: number
          unit_cost?: number
          unit_price?: number
          variant_id?: string
          variant_sku_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_items_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchange_overview"
            referencedColumns: ["exchange_id"]
          },
          {
            foreignKeyName: "exchange_items_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_item_returns"
            referencedColumns: ["sale_item_id"]
          },
          {
            foreignKeyName: "exchange_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "exchange_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "exchange_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      exchanges: {
        Row: {
          bank_name: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          difference_amount: number
          difference_direction: string
          exchange_date: string
          exchange_number: string
          financial_account_id: string | null
          id: string
          new_items_amount: number
          new_items_cost: number
          notes: string | null
          reason: string | null
          receipt_image_path: string | null
          returned_amount: number
          returned_cost: number
          sale_id: string
          settlement_method: string | null
          status: string
          transfer_reference: string | null
          updated_at: string
        }
        Insert: {
          bank_name?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          difference_amount?: number
          difference_direction?: string
          exchange_date?: string
          exchange_number?: string
          financial_account_id?: string | null
          id?: string
          new_items_amount?: number
          new_items_cost?: number
          notes?: string | null
          reason?: string | null
          receipt_image_path?: string | null
          returned_amount?: number
          returned_cost?: number
          sale_id: string
          settlement_method?: string | null
          status?: string
          transfer_reference?: string | null
          updated_at?: string
        }
        Update: {
          bank_name?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          difference_amount?: number
          difference_direction?: string
          exchange_date?: string
          exchange_number?: string
          financial_account_id?: string | null
          id?: string
          new_items_amount?: number
          new_items_cost?: number
          notes?: string | null
          reason?: string | null
          receipt_image_path?: string | null
          returned_amount?: number
          returned_cost?: number
          sale_id?: string
          settlement_method?: string | null
          status?: string
          transfer_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchanges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "exchanges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "exchanges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_performance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "exchanges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_receivables"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "exchanges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchanges_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "exchanges_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchanges_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_net_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "exchanges_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "exchanges_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expense_category_id: string
          expense_date: string
          expense_number: string
          financial_account_id: string
          id: string
          payment_method: string
          receipt_image_path: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_category_id: string
          expense_date?: string
          expense_number?: string
          financial_account_id: string
          id?: string
          payment_method: string
          receipt_image_path?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_category_id?: string
          expense_date?: string
          expense_number?: string
          financial_account_id?: string
          id?: string
          payment_method?: string
          receipt_image_path?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_expense_category_id_fkey"
            columns: ["expense_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expenses_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          account_number: string
          account_type: string
          created_at: string
          current_balance: number
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          notes: string | null
          opening_balance: number
          payment_method: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string
          account_type: string
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          payment_method?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string
          account_type?: string
          created_at?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          payment_method?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      financial_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_number: string
          amount: number
          created_at: string
          created_by: string | null
          direction: string
          financial_account_id: string
          id: string
          notes: string | null
          reason: string
        }
        Insert: {
          adjustment_date?: string
          adjustment_number?: string
          amount: number
          created_at?: string
          created_by?: string | null
          direction: string
          financial_account_id: string
          id?: string
          notes?: string | null
          reason: string
        }
        Update: {
          adjustment_date?: string
          adjustment_number?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          financial_account_id?: string
          id?: string
          notes?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_adjustments_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "financial_adjustments_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          direction: string
          financial_account_id: string
          id: string
          reference_id: string | null
          reference_type: string | null
          signed_amount: number | null
          transaction_date: string
          transaction_number: string
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction: string
          financial_account_id: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          signed_amount?: number | null
          transaction_date?: string
          transaction_number?: string
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: string
          financial_account_id?: string
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          signed_amount?: number | null
          transaction_date?: string
          transaction_number?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "financial_transactions_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          from_account_id: string
          id: string
          notes: string | null
          to_account_id: string
          transfer_date: string
          transfer_number: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          from_account_id: string
          id?: string
          notes?: string | null
          to_account_id: string
          transfer_date?: string
          transfer_number?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          from_account_id?: string
          id?: string
          notes?: string | null
          to_account_id?: string
          transfer_date?: string
          transfer_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "financial_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "financial_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          completed_at: string | null
          created_at: string
          key: string
          operation: string
          result: Json | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          key: string
          operation: string
          result?: Json | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          key?: string
          operation?: string
          result?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustment_items: {
        Row: {
          actual_quantity: number
          adjustment_id: string
          color_snapshot: string | null
          created_at: string
          difference_quantity: number
          id: string
          product_name_snapshot: string
          reason: string | null
          size_snapshot: string | null
          system_quantity: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Insert: {
          actual_quantity: number
          adjustment_id: string
          color_snapshot?: string | null
          created_at?: string
          difference_quantity: number
          id?: string
          product_name_snapshot: string
          reason?: string | null
          size_snapshot?: string | null
          system_quantity: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Update: {
          actual_quantity?: number
          adjustment_id?: string
          color_snapshot?: string | null
          created_at?: string
          difference_quantity?: number
          id?: string
          product_name_snapshot?: string
          reason?: string | null
          size_snapshot?: string | null
          system_quantity?: number
          variant_id?: string
          variant_sku_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustment_items_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "adjustment_overview"
            referencedColumns: ["adjustment_id"]
          },
          {
            foreignKeyName: "inventory_adjustment_items_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "inventory_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustment_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_adjustment_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_adjustment_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustment_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_number: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: string
          items_count: number
          notes: string | null
          reason: string
          status: string
          total_decrease: number
          total_increase: number
          updated_at: string
        }
        Insert: {
          adjustment_date?: string
          adjustment_number?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          items_count?: number
          notes?: string | null
          reason: string
          status?: string
          total_decrease?: number
          total_increase?: number
          updated_at?: string
        }
        Update: {
          adjustment_date?: string
          adjustment_number?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          items_count?: number
          notes?: string | null
          reason?: string
          status?: string
          total_decrease?: number
          total_increase?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          signed_quantity: number | null
          stock_state: string
          transaction_type: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          signed_quantity?: number | null
          stock_state?: string
          transaction_type: string
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          signed_quantity?: number | null
          stock_state?: string
          transaction_type?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_transactions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_transactions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metric: number | null
          notification_key: string
          notify_date: string
          read_at: string | null
          read_by: string | null
          reference_id: string | null
          reference_type: string | null
          severity: string
          threshold: number | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metric?: number | null
          notification_key: string
          notify_date?: string
          read_at?: string | null
          read_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          severity: string
          threshold?: number | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metric?: number | null
          notification_key?: string
          notify_date?: string
          read_at?: string | null
          read_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          severity?: string
          threshold?: number | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          public_url: string | null
          sort_order: number
          storage_path: string
          variant_id: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          public_url?: string | null
          sort_order?: number
          storage_path: string
          variant_id?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          public_url?: string | null
          sort_order?: number
          storage_path?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          minimum_stock: number
          product_id: string
          purchase_price: number
          selling_price: number
          size: string | null
          sku: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          minimum_stock?: number
          product_id: string
          purchase_price?: number
          selling_price?: number
          size?: string | null
          sku: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          minimum_stock?: number
          product_id?: string
          purchase_price?: number
          selling_price?: number
          size?: string | null
          sku?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_balance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_payables"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_performance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_selling_price: number | null
          brand: string | null
          category_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          base_selling_price?: number | null
          brand?: string | null
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          base_selling_price?: number | null
          brand?: string | null
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
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
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          color_snapshot: string | null
          created_at: string
          id: string
          product_name_snapshot: string
          purchase_id: string
          quantity: number
          size_snapshot: string | null
          total_cost: number
          unit_cost: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Insert: {
          color_snapshot?: string | null
          created_at?: string
          id?: string
          product_name_snapshot: string
          purchase_id: string
          quantity: number
          size_snapshot?: string | null
          total_cost: number
          unit_cost: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Update: {
          color_snapshot?: string | null
          created_at?: string
          id?: string
          product_name_snapshot?: string
          purchase_id?: string
          quantity?: number
          size_snapshot?: string | null
          total_cost?: number
          unit_cost?: number
          variant_id?: string
          variant_sku_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_overview"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      purchase_payments: {
        Row: {
          amount: number
          bank_name: string | null
          created_at: string
          created_by: string | null
          financial_account_id: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          purchase_id: string
          receipt_image_path: string | null
          transfer_reference: string | null
        }
        Insert: {
          amount: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          financial_account_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method: string
          purchase_id: string
          receipt_image_path?: string | null
          transfer_reference?: string | null
        }
        Update: {
          amount?: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          financial_account_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          purchase_id?: string
          receipt_image_path?: string | null
          transfer_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payments_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "purchase_payments_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchase_overview"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "purchase_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          discount: number
          id: string
          notes: string | null
          paid_amount: number
          payment_status: string
          purchase_date: string
          purchase_number: string
          remaining_amount: number
          status: string
          subtotal: number
          supplier_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_status?: string
          purchase_date?: string
          purchase_number?: string
          remaining_amount?: number
          status?: string
          subtotal?: number
          supplier_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_status?: string
          purchase_date?: string
          purchase_number?: string
          remaining_amount?: number
          status?: string
          subtotal?: number
          supplier_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_balance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_payables"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_performance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      report_settings: {
        Row: {
          customer_debt_threshold: number
          dead_stock_days: number
          expense_growth_percent: number
          high_return_rate_percent: number
          id: boolean
          supplier_debt_threshold: number
          updated_at: string
        }
        Insert: {
          customer_debt_threshold?: number
          dead_stock_days?: number
          expense_growth_percent?: number
          high_return_rate_percent?: number
          id?: boolean
          supplier_debt_threshold?: number
          updated_at?: string
        }
        Update: {
          customer_debt_threshold?: number
          dead_stock_days?: number
          expense_growth_percent?: number
          high_return_rate_percent?: number
          id?: boolean
          supplier_debt_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      return_refunds: {
        Row: {
          amount: number
          bank_name: string | null
          created_at: string
          created_by: string | null
          financial_account_id: string | null
          id: string
          notes: string | null
          receipt_image_path: string | null
          refund_date: string
          refund_method: string
          return_id: string
          transfer_reference: string | null
        }
        Insert: {
          amount: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          financial_account_id?: string | null
          id?: string
          notes?: string | null
          receipt_image_path?: string | null
          refund_date?: string
          refund_method: string
          return_id: string
          transfer_reference?: string | null
        }
        Update: {
          amount?: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          financial_account_id?: string | null
          id?: string
          notes?: string | null
          receipt_image_path?: string | null
          refund_date?: string
          refund_method?: string
          return_id?: string
          transfer_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_refunds_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "return_refunds_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_refunds_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_overview"
            referencedColumns: ["return_id"]
          },
          {
            foreignKeyName: "return_refunds_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          permission: string
          role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed?: boolean
          permission: string
          role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed?: boolean
          permission?: string
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          color_snapshot: string | null
          created_at: string
          id: string
          product_name_snapshot: string
          quantity: number
          sale_id: string
          size_snapshot: string | null
          total_cost: number
          total_price: number
          unit_cost: number
          unit_price: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Insert: {
          color_snapshot?: string | null
          created_at?: string
          id?: string
          product_name_snapshot: string
          quantity: number
          sale_id: string
          size_snapshot?: string | null
          total_cost: number
          total_price: number
          unit_cost: number
          unit_price: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Update: {
          color_snapshot?: string | null
          created_at?: string
          id?: string
          product_name_snapshot?: string
          quantity?: number
          sale_id?: string
          size_snapshot?: string | null
          total_cost?: number
          total_price?: number
          unit_cost?: number
          unit_price?: number
          variant_id?: string
          variant_sku_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_net_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          bank_name: string | null
          created_at: string
          created_by: string | null
          financial_account_id: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          receipt_image_path: string | null
          sale_id: string
          transfer_reference: string | null
        }
        Insert: {
          amount: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          financial_account_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method: string
          receipt_image_path?: string | null
          sale_id: string
          transfer_reference?: string | null
        }
        Update: {
          amount?: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          financial_account_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          receipt_image_path?: string | null
          sale_id?: string
          transfer_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sale_payments_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_net_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount: number
          id: string
          notes: string | null
          paid_amount: number
          payment_status: string
          remaining_amount: number
          sale_date: string
          sale_number: string
          status: string
          subtotal: number
          total_amount: number
          total_cost: number
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_status?: string
          remaining_amount?: number
          sale_date?: string
          sale_number?: string
          status?: string
          subtotal?: number
          total_amount?: number
          total_cost?: number
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_status?: string
          remaining_amount?: number
          sale_date?: string
          sale_number?: string
          status?: string
          subtotal?: number
          total_amount?: number
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_performance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_receivables"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_items: {
        Row: {
          color_snapshot: string | null
          condition: string
          created_at: string
          id: string
          product_name_snapshot: string
          quantity: number
          reason: string | null
          return_id: string
          sale_item_id: string
          size_snapshot: string | null
          total_amount: number
          total_cost: number
          unit_cost: number
          unit_price: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Insert: {
          color_snapshot?: string | null
          condition?: string
          created_at?: string
          id?: string
          product_name_snapshot: string
          quantity: number
          reason?: string | null
          return_id: string
          sale_item_id: string
          size_snapshot?: string | null
          total_amount: number
          total_cost?: number
          unit_cost: number
          unit_price: number
          variant_id: string
          variant_sku_snapshot: string
        }
        Update: {
          color_snapshot?: string | null
          condition?: string
          created_at?: string
          id?: string
          product_name_snapshot?: string
          quantity?: number
          reason?: string | null
          return_id?: string
          sale_item_id?: string
          size_snapshot?: string | null
          total_amount?: number
          total_cost?: number
          unit_cost?: number
          unit_price?: number
          variant_id?: string
          variant_sku_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_overview"
            referencedColumns: ["return_id"]
          },
          {
            foreignKeyName: "sales_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_item_returns"
            referencedColumns: ["sale_item_id"]
          },
          {
            foreignKeyName: "sales_return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sales_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sales_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount: number
          id: string
          notes: string | null
          reason: string | null
          refund_amount: number
          refund_status: string
          refunded_amount: number
          return_date: string
          return_number: string
          sale_id: string
          status: string
          subtotal: number
          total_cost: number
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          reason?: string | null
          refund_amount?: number
          refund_status?: string
          refunded_amount?: number
          return_date?: string
          return_number?: string
          sale_id: string
          status?: string
          subtotal?: number
          total_cost?: number
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          reason?: string | null
          refund_amount?: number
          refund_status?: string
          refunded_amount?: number
          return_date?: string
          return_number?: string
          sale_id?: string
          status?: string
          subtotal?: number
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_performance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_receivables"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_net_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string | null
          city: string | null
          country: string
          created_at: string
          currency: string
          currency_symbol: string
          date_format: string
          email: string | null
          id: boolean
          logo_path: string | null
          phone: string | null
          secondary_phone: string | null
          store_name: string
          store_name_ar: string | null
          store_name_en: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          currency?: string
          currency_symbol?: string
          date_format?: string
          email?: string | null
          id?: boolean
          logo_path?: string | null
          phone?: string | null
          secondary_phone?: string | null
          store_name?: string
          store_name_ar?: string | null
          store_name_en?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          currency?: string
          currency_symbol?: string
          date_format?: string
          email?: string | null
          id?: boolean
          logo_path?: string | null
          phone?: string | null
          secondary_phone?: string | null
          store_name?: string
          store_name_ar?: string | null
          store_name_en?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      supplier_balance_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          signed_amount: number | null
          supplier_id: string
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          signed_amount?: number | null
          supplier_id: string
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          signed_amount?: number | null
          supplier_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_balance_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_balance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_balance_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_payables"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_balance_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_performance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_balance_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      system_events: {
        Row: {
          category: string
          code: string | null
          id: string
          message: string
          metadata: Json | null
          occurred_at: string
          operation: string
          request_id: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          category: string
          code?: string | null
          id?: string
          message: string
          metadata?: Json | null
          occurred_at?: string
          operation: string
          request_id?: string | null
          severity: string
          user_id?: string | null
        }
        Update: {
          category?: string
          code?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          occurred_at?: string
          operation?: string
          request_id?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          allowed_values: Json | null
          category: string
          description: string | null
          id: string
          is_public: boolean
          key: string
          max_value: number | null
          min_value: number | null
          updated_at: string
          updated_by: string | null
          value: Json
          value_type: string
        }
        Insert: {
          allowed_values?: Json | null
          category: string
          description?: string | null
          id?: string
          is_public?: boolean
          key: string
          max_value?: number | null
          min_value?: number | null
          updated_at?: string
          updated_by?: string | null
          value: Json
          value_type: string
        }
        Update: {
          allowed_values?: Json | null
          category?: string
          description?: string | null
          id?: string
          is_public?: boolean
          key?: string
          max_value?: number | null
          min_value?: number | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          account_number: string | null
          account_type: string | null
          balance: number | null
          is_active: boolean | null
          is_default: boolean | null
          name: string | null
          opening_balance: number | null
          total_in: number | null
          total_out: number | null
        }
        Relationships: []
      }
      adjustment_overview: {
        Row: {
          adjustment_id: string | null
          decrease_quantity: number | null
          increase_quantity: number | null
          item_count: number | null
        }
        Relationships: []
      }
      customer_balance: {
        Row: {
          balance: number | null
          customer_id: string | null
          total_paid: number | null
          total_refunded: number | null
          total_returns: number | null
          total_sales: number | null
        }
        Relationships: []
      }
      customer_overview: {
        Row: {
          customer_id: string | null
          last_sale_date: string | null
          sales_count: number | null
          total_purchases: number | null
        }
        Relationships: []
      }
      customer_performance: {
        Row: {
          average_order_value: number | null
          customer_id: string | null
          customer_number: string | null
          is_active: boolean | null
          last_payment_date: string | null
          last_sale_date: string | null
          name: string | null
          outstanding: number | null
          phone: string | null
          sales_count: number | null
          total_paid: number | null
          total_purchased: number | null
          total_returns: number | null
        }
        Relationships: []
      }
      customer_receivables: {
        Row: {
          customer_id: string | null
          customer_number: string | null
          last_payment_date: string | null
          name: string | null
          outstanding: number | null
          phone: string | null
          total_paid: number | null
          total_refunded: number | null
          total_returns: number | null
          total_sales: number | null
        }
        Relationships: []
      }
      exchange_overview: {
        Row: {
          exchange_id: string | null
          new_quantity: number | null
          profit_delta: number | null
          returned_quantity: number | null
        }
        Relationships: []
      }
      inventory_valuation: {
        Row: {
          brand: string | null
          category_id: string | null
          category_name: string | null
          color: string | null
          current_stock: number | null
          damaged_quantity: number | null
          is_active: boolean | null
          minimum_stock: number | null
          potential_profit: number | null
          product_id: string | null
          product_name: string | null
          purchase_price: number | null
          selling_price: number | null
          size: string | null
          sku: string | null
          stock_cost: number | null
          stock_retail: number | null
          supplier_id: string | null
          supplier_name: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_balance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_payables"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_performance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_overview: {
        Row: {
          damaged_stock: number | null
          min_selling_price: number | null
          product_id: string | null
          stock_value: number | null
          total_stock: number | null
          variants_count: number | null
        }
        Relationships: []
      }
      product_performance: {
        Row: {
          brand: string | null
          category_id: string | null
          category_name: string | null
          color: string | null
          gross_profit: number | null
          gross_revenue: number | null
          last_purchase_date: string | null
          last_sale_date: string | null
          minimum_stock: number | null
          net_cost: number | null
          net_quantity: number | null
          net_revenue: number | null
          product_id: string | null
          product_name: string | null
          purchase_price: number | null
          returned_quantity: number | null
          returned_value: number | null
          selling_price: number | null
          size: string | null
          sku: string | null
          sold_quantity: number | null
          supplier_id: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_balance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_payables"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_performance"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "product_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_overview: {
        Row: {
          item_count: number | null
          purchase_id: string | null
          total_quantity: number | null
        }
        Relationships: []
      }
      return_overview: {
        Row: {
          item_count: number | null
          profit_reversal: number | null
          return_id: string | null
          total_quantity: number | null
        }
        Relationships: []
      }
      sale_item_returns: {
        Row: {
          returnable_quantity: number | null
          returned_quantity: number | null
          sale_id: string | null
          sale_item_id: string | null
          sold_quantity: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_net_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_overview"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_valuation"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_performance"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      sale_net_overview: {
        Row: {
          gross_amount: number | null
          net_amount: number | null
          net_cost: number | null
          net_profit: number | null
          returned_amount: number | null
          sale_id: string | null
        }
        Relationships: []
      }
      sale_overview: {
        Row: {
          gross_margin: number | null
          gross_profit: number | null
          item_count: number | null
          sale_id: string | null
          total_quantity: number | null
        }
        Relationships: []
      }
      supplier_balance: {
        Row: {
          balance: number | null
          supplier_id: string | null
          total_paid: number | null
          total_purchases: number | null
          total_returns: number | null
        }
        Relationships: []
      }
      supplier_payables: {
        Row: {
          last_payment_date: string | null
          name: string | null
          outstanding: number | null
          phone: string | null
          supplier_id: string | null
          total_paid: number | null
          total_purchases: number | null
        }
        Relationships: []
      }
      supplier_performance: {
        Row: {
          is_active: boolean | null
          last_payment_date: string | null
          last_purchase_date: string | null
          name: string | null
          outstanding: number | null
          phone: string | null
          purchase_count: number | null
          supplier_id: string | null
          total_paid: number | null
          total_purchases: number | null
          total_returns: number | null
        }
        Relationships: []
      }
      variant_stock: {
        Row: {
          available_quantity: number | null
          current_stock: number | null
          damaged_quantity: number | null
          product_id: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_overview"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      account_ledger: {
        Args: { p_account_id: string; p_limit?: number }
        Returns: {
          created_at: string
          description: string
          id: string
          money_in: number
          money_out: number
          reference_id: string
          reference_type: string
          running_balance: number
          transaction_date: string
          transaction_number: string
          transaction_type: string
        }[]
      }
      add_purchase_payment: { Args: { p_payload: Json }; Returns: Json }
      add_return_refund: { Args: { p_payload: Json }; Returns: Json }
      add_sale_payment: { Args: { p_payload: Json }; Returns: Json }
      apply_purchase_completion: {
        Args: {
          p_actor: string
          p_payment: Json
          p_purchase_id: string
          p_update_cost: boolean
        }
        Returns: Json
      }
      apply_sale_completion: {
        Args: { p_actor: string; p_payments: Json; p_sale_id: string }
        Returns: Json
      }
      backfill_financial_transactions: { Args: never; Returns: Json }
      can_adjust_inventory: { Args: never; Returns: boolean }
      can_administer_finance: { Args: never; Returns: boolean }
      can_manage_catalog: { Args: never; Returns: boolean }
      can_manage_finance: { Args: never; Returns: boolean }
      can_manage_purchases: { Args: never; Returns: boolean }
      can_manage_returns: { Args: never; Returns: boolean }
      can_manage_sales: { Args: never; Returns: boolean }
      can_manage_settings: { Args: never; Returns: boolean }
      can_manage_users: { Args: never; Returns: boolean }
      can_return: { Args: never; Returns: boolean }
      can_sell: { Args: never; Returns: boolean }
      can_view_audit_log: { Args: never; Returns: boolean }
      can_view_finance: { Args: never; Returns: boolean }
      can_view_reports: { Args: never; Returns: boolean }
      cancel_exchange: {
        Args: { p_exchange_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_expense: {
        Args: { p_expense_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_inventory_adjustment: {
        Args: { p_adjustment_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_purchase: {
        Args: { p_purchase_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_sale: {
        Args: { p_reason?: string; p_sale_id: string }
        Returns: Json
      }
      cancel_sales_return: {
        Args: { p_reason?: string; p_return_id: string }
        Returns: Json
      }
      complete_purchase: { Args: { p_payload: Json }; Returns: Json }
      complete_sale: { Args: { p_payload: Json }; Returns: Json }
      compute_management_alerts: {
        Args: never
        Returns: {
          alert_key: string
          detail: string
          metric: number
          severity: string
          threshold: number
        }[]
      }
      create_cash_closing: { Args: { p_payload: Json }; Returns: Json }
      create_customer: { Args: { p_payload: Json }; Returns: Json }
      create_exchange: { Args: { p_payload: Json }; Returns: Json }
      create_expense: { Args: { p_payload: Json }; Returns: Json }
      create_financial_account: { Args: { p_payload: Json }; Returns: Json }
      create_financial_adjustment: { Args: { p_payload: Json }; Returns: Json }
      create_financial_transfer: { Args: { p_payload: Json }; Returns: Json }
      create_inventory_adjustment: { Args: { p_payload: Json }; Returns: Json }
      create_product_with_variants: {
        Args: { p_product: Json; p_variants: Json }
        Returns: string
      }
      create_purchase: { Args: { p_payload: Json }; Returns: Json }
      create_sale: { Args: { p_payload: Json }; Returns: Json }
      create_sales_return: { Args: { p_payload: Json }; Returns: Json }
      create_variant_with_stock: { Args: { p_variant: Json }; Returns: string }
      current_user_role: { Args: never; Returns: string }
      customer_ledger: {
        Args: { p_customer_id: string; p_limit?: number }
        Returns: {
          amount: number
          created_at: string
          description: string
          id: string
          reference_id: string
          reference_type: string
          running_balance: number
          signed_amount: number
          transaction_type: string
        }[]
      }
      daily_cash_summary: {
        Args: { p_date?: string }
        Returns: {
          closing_cash: number
          customer_payments: number
          expenses: number
          opening_cash: number
          other_in: number
          other_out: number
          purchase_payments: number
          refunds: number
          sale_payments: number
          supplier_payments: number
          transfers_in: number
          transfers_out: number
        }[]
      }
      damaged_stock: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          available_quantity: number
          color: string
          damaged_quantity: number
          product_id: string
          product_name: string
          purchase_price: number
          size: string
          sku: string
          total_count: number
          variant_id: string
        }[]
      }
      delete_draft_purchase: { Args: { p_purchase_id: string }; Returns: Json }
      delete_draft_sale: { Args: { p_sale_id: string }; Returns: Json }
      expense_report: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          category_id: string
          category_name: string
          entry_count: number
          percentage: number
          total: number
        }[]
      }
      finance_series: {
        Args: { p_bucket?: string; p_date_from?: string; p_date_to?: string }
        Returns: {
          bucket: string
          cogs: number
          expenses: number
          gross_profit: number
          net_sales: number
        }[]
      }
      finance_summary: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          bank_balance: number
          cash_balance: number
          cash_in: number
          cash_out: number
          cogs: number
          customer_receivables: number
          gross_margin: number
          gross_profit: number
          gross_sales: number
          net_cash_flow: number
          net_sales: number
          operating_expenses: number
          operating_profit: number
          payments_made: number
          payments_received: number
          purchase_payments: number
          refunds_paid: number
          sales_discounts: number
          sales_returns: number
          supplier_payables: number
          total_purchases: number
        }[]
      }
      generate_notifications: { Args: never; Returns: number }
      get_daily_closing_summary: {
        Args: { p_date?: string }
        Returns: {
          bank_closing: number
          bank_in: number
          bank_opening: number
          bank_out: number
          cash_closing: number
          cash_in: number
          cash_opening: number
          cash_out: number
          closing_date: string
          customer_outstanding: number
          expenses_total: number
          gross_profit: number
          returns_total: number
          sales_total: number
          supplier_outstanding: number
        }[]
      }
      get_data_statistics: {
        Args: never
        Returns: {
          audit_logs: number
          customers: number
          exchanges: number
          expenses: number
          financial_transactions: number
          inventory_transactions: number
          products: number
          purchases: number
          returns: number
          sales: number
          suppliers: number
          variants: number
        }[]
      }
      get_distinct_brands: { Args: never; Returns: string[] }
      get_inventory_movement_report: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_type?: string
          p_variant?: string
        }
        Returns: {
          actor_name: string
          id: string
          moved_at: string
          notes: string
          product_name: string
          quantity_in: number
          quantity_out: number
          reference_id: string
          reference_type: string
          signed_quantity: number
          sku: string
          stock_state: string
          total_count: number
          transaction_type: string
          variant_id: string
        }[]
      }
      get_inventory_value_report: {
        Args: never
        Returns: {
          damaged_units: number
          low_stock_count: number
          out_of_stock_count: number
          potential_margin: number
          potential_profit: number
          stock_cost: number
          stock_retail: number
          total_units: number
          total_variants: number
        }[]
      }
      get_management_alerts: {
        Args: never
        Returns: {
          alert_key: string
          detail: string
          metric: number
          severity: string
          threshold: number
        }[]
      }
      get_management_kpis: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          average_order_value: number
          customer_receivables: number
          expense_ratio: number
          gross_margin: number
          gross_profit: number
          inventory_cost: number
          inventory_turnover: number
          low_stock_count: number
          net_sales: number
          operating_margin: number
          operating_profit: number
          order_count: number
          return_rate: number
          supplier_payables: number
          units_per_order: number
          units_sold: number
        }[]
      }
      get_monthly_performance: {
        Args: { p_year?: number }
        Returns: {
          cash_in: number
          cash_out: number
          cogs: number
          expenses: number
          gross_profit: number
          gross_sales: number
          label: string
          net_cash_flow: number
          net_sales: number
          operating_profit: number
          period_start: string
        }[]
      }
      get_period_comparison: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          change_percent: number
          change_value: number
          current_value: number
          metric: string
          previous_value: number
        }[]
      }
      get_product_report: {
        Args: {
          p_brand?: string
          p_category?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_sort?: string
          p_supplier?: string
        }
        Returns: {
          brand: string
          category_name: string
          cogs: number
          color: string
          gross_profit: number
          gross_revenue: number
          margin: number
          net_quantity: number
          net_revenue: number
          product_id: string
          product_name: string
          returned_quantity: number
          size: string
          sku: string
          sold_quantity: number
          total_count: number
          variant_id: string
        }[]
      }
      get_profit_by_dimension: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_dimension?: string
          p_limit?: number
        }
        Returns: {
          cogs: number
          dimension_id: string
          dimension_name: string
          gross_profit: number
          margin: number
          net_sales: number
          units_sold: number
        }[]
      }
      get_profit_report: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          cogs: number
          discounts: number
          gross_margin: number
          gross_profit: number
          gross_sales: number
          net_sales: number
          operating_expenses: number
          operating_margin: number
          operating_profit: number
          returns_value: number
        }[]
      }
      get_purchase_report: {
        Args: { p_date_from?: string; p_date_to?: string; p_supplier?: string }
        Returns: {
          net_purchases: number
          outstanding: number
          paid_to_suppliers: number
          purchase_count: number
          purchase_returns: number
          total_purchases: number
          units_purchased: number
        }[]
      }
      get_sales_report: {
        Args: {
          p_category?: string
          p_customer?: string
          p_date_from?: string
          p_date_to?: string
          p_method?: string
        }
        Returns: {
          average_order: number
          bank_sales: number
          cash_sales: number
          discounts: number
          gross_sales: number
          invoice_count: number
          net_sales: number
          returns_value: number
          total_collected: number
          total_outstanding: number
          units_returned: number
          units_sold: number
        }[]
      }
      get_sales_series: {
        Args: { p_bucket?: string; p_date_from?: string; p_date_to?: string }
        Returns: {
          bucket: string
          gross_sales: number
          invoice_count: number
          net_sales: number
          returns_value: number
        }[]
      }
      get_setting: { Args: { p_key: string }; Returns: Json }
      get_settings_by_category: {
        Args: { p_category: string }
        Returns: {
          allowed_values: Json
          category: string
          description: string
          key: string
          max_value: number
          min_value: number
          updated_at: string
          value: Json
          value_type: string
        }[]
      }
      get_stock_alert_report: {
        Args: {
          p_category?: string
          p_limit?: number
          p_mode?: string
          p_offset?: number
        }
        Returns: {
          brand: string
          category_name: string
          color: string
          current_stock: number
          days_since_sale: number
          last_purchase_date: string
          last_sale_date: string
          minimum_stock: number
          product_id: string
          product_name: string
          shortfall: number
          size: string
          sku: string
          stock_cost: number
          stock_retail: number
          supplier_name: string
          total_count: number
          variant_id: string
        }[]
      }
      get_variant_facets: { Args: never; Returns: Json }
      get_yearly_performance: {
        Args: { p_years?: number }
        Returns: {
          expenses: number
          gross_profit: number
          label: string
          net_cash_flow: number
          net_sales: number
          operating_profit: number
          period_start: string
          total_purchases: number
        }[]
      }
      has_permission: { Args: { p_permission: string }; Returns: boolean }
      idempotency_claim: {
        Args: { p_key: string; p_operation: string }
        Returns: Json
      }
      idempotency_store: {
        Args: { p_key: string; p_result: Json }
        Returns: undefined
      }
      idempotent: {
        Args: { p_operation: string; p_payload: Json }
        Returns: Json
      }
      integrity_checks: {
        Args: never
        Returns: {
          check_key: string
          detail: string
          issue_count: number
          reference: string
          severity: string
          title: string
        }[]
      }
      inventory_direction: { Args: { p_type: string }; Returns: number }
      inventory_summary: {
        Args: { p_low_stock_threshold?: number }
        Returns: {
          low_stock_count: number
          out_of_stock_count: number
          stock_value: number
          total_products: number
          total_units: number
          total_variants: number
        }[]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: { Args: { p_id: string }; Returns: Json }
      my_permissions: { Args: never; Returns: string[] }
      next_account_number: { Args: never; Returns: string }
      next_adjustment_number: { Args: never; Returns: string }
      next_closing_number: { Args: never; Returns: string }
      next_customer_number: { Args: never; Returns: string }
      next_exchange_number: { Args: never; Returns: string }
      next_expense_number: { Args: never; Returns: string }
      next_financial_adjustment_number: { Args: never; Returns: string }
      next_financial_transaction_number: { Args: never; Returns: string }
      next_purchase_number: { Args: never; Returns: string }
      next_return_number: { Args: never; Returns: string }
      next_sale_number: { Args: never; Returns: string }
      next_transfer_number: { Args: never; Returns: string }
      notification_shape: {
        Args: { p_key: string }
        Returns: {
          enabled: boolean
          ntype: string
          title: string
        }[]
      }
      payment_method_breakdown: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          in_percentage: number
          method: string
          money_in: number
          money_out: number
          net: number
        }[]
      }
      reconciliation_summary: {
        Args: never
        Returns: {
          amount: number
          label: string
          reference: string
        }[]
      }
      record_backup_verified: { Args: { p_payload: Json }; Returns: Json }
      record_stock_damage: { Args: { p_payload: Json }; Returns: Json }
      record_system_event: {
        Args: {
          p_category: string
          p_code?: string
          p_message: string
          p_metadata?: Json
          p_operation: string
          p_request_id?: string
          p_severity: string
        }
        Returns: undefined
      }
      refresh_return_refund_status: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      resolve_financial_account: {
        Args: { p_account: string; p_method: string }
        Returns: string
      }
      returns_summary: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          cost_returned: number
          credited_value: number
          damaged_units: number
          profit_reversal: number
          refunded_value: number
          returns_count: number
          returns_value: number
          units_returned: number
        }[]
      }
      role_has_permission: {
        Args: { p_permission: string; p_role: string }
        Returns: boolean
      }
      sale_returnable_items: {
        Args: { p_sale_id: string }
        Returns: {
          color_snapshot: string
          image_path: string
          net_unit_price: number
          product_name_snapshot: string
          returnable_quantity: number
          returned_quantity: number
          sale_item_id: string
          size_snapshot: string
          sold_quantity: number
          unit_cost: number
          unit_price: number
          variant_id: string
          variant_sku_snapshot: string
        }[]
      }
      sales_summary: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          bank_collected: number
          cash_collected: number
          gross_margin: number
          gross_profit: number
          gross_sales: number
          net_cost_after_returns: number
          net_profit_after_returns: number
          net_sales: number
          net_sales_after_returns: number
          returns_cost: number
          returns_count: number
          returns_value: number
          sales_count: number
          total_cost: number
          total_discount: number
          total_outstanding: number
          total_paid: number
          units_returned: number
          units_sold: number
        }[]
      }
      search_adjustments: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_reason?: string
          p_search?: string
          p_status?: string
        }
        Returns: {
          adjustment_date: string
          adjustment_number: string
          created_at: string
          created_by_name: string
          id: string
          items_count: number
          notes: string
          reason: string
          status: string
          total_count: number
          total_decrease: number
          total_increase: number
        }[]
      }
      search_audit_logs: {
        Args: {
          p_action?: string
          p_date_from?: string
          p_date_to?: string
          p_entity?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_user?: string
        }
        Returns: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          total_count: number
          user_id: string
          user_name: string
        }[]
      }
      search_customers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          created_at: string
          customer_number: string
          email: string
          id: string
          is_active: boolean
          last_sale_date: string
          name: string
          phone: string
          sales_count: number
          total_count: number
          total_purchases: number
          whatsapp: string
        }[]
      }
      search_exchanges: {
        Args: {
          p_customer_id?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          created_at: string
          customer_id: string
          customer_name: string
          difference_amount: number
          difference_direction: string
          exchange_date: string
          exchange_number: string
          id: string
          new_items_amount: number
          new_quantity: number
          returned_amount: number
          returned_quantity: number
          sale_id: string
          sale_number: string
          status: string
          total_count: number
        }[]
      }
      search_expenses: {
        Args: {
          p_account?: string
          p_category?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_max_amount?: number
          p_method?: string
          p_min_amount?: number
          p_offset?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          account_id: string
          account_name: string
          amount: number
          category_id: string
          category_name: string
          created_at: string
          created_by_name: string
          description: string
          expense_date: string
          expense_number: string
          id: string
          payment_method: string
          status: string
          total_count: number
        }[]
      }
      search_financial_transactions: {
        Args: {
          p_account?: string
          p_date_from?: string
          p_date_to?: string
          p_direction?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_type?: string
        }
        Returns: {
          account_id: string
          account_name: string
          account_type: string
          amount: number
          created_at: string
          created_by_name: string
          description: string
          direction: string
          id: string
          reference_id: string
          reference_type: string
          signed_amount: number
          total_count: number
          transaction_date: string
          transaction_number: string
          transaction_type: string
        }[]
      }
      search_inventory: {
        Args: {
          p_category_id?: string
          p_color?: string
          p_limit?: number
          p_low_stock_threshold?: number
          p_offset?: number
          p_search?: string
          p_size?: string
          p_stock_status?: string
          p_supplier_id?: string
        }
        Returns: {
          barcode: string
          category_name: string
          color: string
          current_stock: number
          is_active: boolean
          primary_image_path: string
          product_id: string
          product_name: string
          purchase_price: number
          selling_price: number
          size: string
          sku: string
          supplier_id: string
          supplier_name: string
          total_count: number
          variant_id: string
        }[]
      }
      search_products: {
        Args: {
          p_brand?: string
          p_category_id?: string
          p_limit?: number
          p_low_stock_threshold?: number
          p_max_price?: number
          p_min_price?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_status?: string
          p_stock_status?: string
        }
        Returns: {
          base_selling_price: number
          brand: string
          category_id: string
          category_name: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          min_selling_price: number
          name: string
          primary_image_path: string
          stock_value: number
          total_count: number
          total_stock: number
          variants_count: number
        }[]
      }
      search_purchases: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_max_amount?: number
          p_min_amount?: number
          p_offset?: number
          p_payment_method?: string
          p_payment_status?: string
          p_search?: string
          p_status?: string
          p_supplier_id?: string
        }
        Returns: {
          created_at: string
          discount: number
          id: string
          item_count: number
          paid_amount: number
          payment_status: string
          purchase_date: string
          purchase_number: string
          remaining_amount: number
          status: string
          subtotal: number
          supplier_id: string
          supplier_name: string
          total_amount: number
          total_count: number
          total_quantity: number
        }[]
      }
      search_returns: {
        Args: {
          p_customer_id?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_reason?: string
          p_refund_status?: string
          p_search?: string
          p_status?: string
        }
        Returns: {
          created_at: string
          customer_id: string
          customer_name: string
          id: string
          item_count: number
          reason: string
          refund_amount: number
          refund_status: string
          refunded_amount: number
          return_date: string
          return_number: string
          sale_id: string
          sale_number: string
          status: string
          total_count: number
          total_quantity: number
        }[]
      }
      search_sales: {
        Args: {
          p_category_id?: string
          p_customer_id?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_max_amount?: number
          p_min_amount?: number
          p_offset?: number
          p_payment_method?: string
          p_payment_status?: string
          p_search?: string
          p_status?: string
        }
        Returns: {
          created_at: string
          customer_id: string
          customer_name: string
          discount: number
          gross_profit: number
          id: string
          item_count: number
          paid_amount: number
          payment_status: string
          remaining_amount: number
          sale_date: string
          sale_number: string
          status: string
          subtotal: number
          total_amount: number
          total_cost: number
          total_count: number
          total_quantity: number
        }[]
      }
      set_role_permission: {
        Args: { p_allowed: boolean; p_permission: string; p_role: string }
        Returns: Json
      }
      setting_bool: {
        Args: { p_default?: boolean; p_key: string }
        Returns: boolean
      }
      setting_number: {
        Args: { p_default?: number; p_key: string }
        Returns: number
      }
      setting_text: {
        Args: { p_default?: string; p_key: string }
        Returns: string
      }
      setting_uuid: { Args: { p_key: string }; Returns: string }
      supplier_ledger: {
        Args: { p_limit?: number; p_supplier_id: string }
        Returns: {
          amount: number
          created_at: string
          description: string
          id: string
          reference_id: string
          reference_type: string
          running_balance: number
          signed_amount: number
          transaction_type: string
        }[]
      }
      system_event_summary: {
        Args: { p_hours?: number }
        Returns: {
          category: string
          event_count: number
          latest_at: string
          severity: string
        }[]
      }
      top_customers: {
        Args: { p_date_from?: string; p_date_to?: string; p_limit?: number }
        Returns: {
          customer_id: string
          customer_number: string
          name: string
          sales_count: number
          total_amount: number
        }[]
      }
      top_selling_products: {
        Args: { p_date_from?: string; p_date_to?: string; p_limit?: number }
        Returns: {
          product_name: string
          profit: number
          revenue: number
          sku: string
          units_sold: number
          variant_id: string
        }[]
      }
      unread_notification_count: { Args: never; Returns: number }
      update_financial_account: { Args: { p_payload: Json }; Returns: Json }
      update_report_settings: { Args: { p_payload: Json }; Returns: Json }
      update_setting: { Args: { p_key: string; p_value: Json }; Returns: Json }
      update_store_settings: { Args: { p_payload: Json }; Returns: Json }
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

