// ─── Base ────────────────────────────────────────────────────────────────────

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ─── Tenants ─────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  stripe_customer_id: string | null;
}

export interface TenantSettings {
  id: string;
  tenant_id: string;
  default_tax_rate: number | null;       // e.g. 0.1025
  default_valid_days: number;
  quote_number_prefix: string;
  quote_number_sequence: number;
  default_payment_terms: string;
  signature_provider: string;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "member";

export interface User {
  id: string;               // matches Supabase Auth user id
  tenant_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  tenant_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  logo_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Products ────────────────────────────────────────────────────────────────

export interface ProductCategory {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
}

export type ItemType = "Service" | "Hardware" | "Software" | "Other";
export type BillingPeriod = "Monthly" | "One Time";

export interface Product {
  id: string;
  tenant_id: string;
  zomentum_id: string | null;
  category_id: string | null;
  name: string;
  description: string | null;
  item_type: ItemType | null;
  billing_period: BillingPeriod | null;
  unit: string | null;
  unit_cost: number | null;
  unit_price: number | null;
  setup_price: number;
  is_taxable: boolean;
  is_price_overrideable: boolean;
  is_active: boolean;
  manufacturer: string | null;
  manufacturer_part_no: string | null;
  supplier_name: string | null;
  supplier_sku: string | null;
  autotask_id: string | null;
  quickbooks_online_id: string | null;
  created_at: string;
}

export interface ProductPricingTier {
  id: string;
  product_id: string;
  tier_name: string;
  description: string | null;
  unit_cost: number | null;
  unit_price: number | null;
  is_default: boolean;
  sort_order: number;
}

// ─── Templates ───────────────────────────────────────────────────────────────

export type TemplateSourceType = "docx" | "md" | "native";

export interface Template {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  document_content: Json | null;        // BlockNote JSON
  tags: string[];
  source_file_type: TemplateSourceType | null;
  is_active: boolean;
  created_at: string;
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

export type QuoteStatus = "draft" | "sent" | "viewed" | "signed" | "declined" | "expired";

export interface Quote {
  id: string;
  tenant_id: string;
  client_id: string;
  template_id: string | null;
  quote_number: string;
  title: string | null;
  status: QuoteStatus;
  document_content: Json | null;        // BlockNote JSON
  valid_until: string | null;           // date ISO string
  notes: string | null;
  show_margins: boolean;
  tax_rate: number | null;
  payment_terms: string | null;
  selected_scenario_id: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  signed_at: string | null;
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

export interface QuoteScenario {
  id: string;
  quote_id: string;
  name: string;
  description: string | null;
  is_recommended: boolean;
  sort_order: number;
  monthly_recurring_total: number;
  onetime_total: number;
  tax_amount: number;
  total: number;
}

// ─── Line Items ──────────────────────────────────────────────────────────────

export interface QuoteLineItem {
  id: string;
  scenario_id: string;
  product_id: string | null;
  pricing_tier_id: string | null;
  description: string;
  billing_period: BillingPeriod | null;
  quantity: number;
  unit_cost: number | null;
  unit_price: number | null;
  setup_price: number;
  is_taxable: boolean;
  margin_percent: number | null;        // computed: ((price-cost)/price)*100
  line_total: number | null;            // computed: qty * unit_price
  sort_order: number;
}

// ─── Signers ─────────────────────────────────────────────────────────────────

export type SignerRole = "Client" | "Authorized Signatory" | "MSP Owner";
export type SignerStatus = "pending" | "sent" | "viewed" | "signed" | "declined";

export interface QuoteSigner {
  id: string;
  quote_id: string;
  signer_name: string;
  signer_email: string;
  role: SignerRole;
  signing_order: number;
  status: SignerStatus;
  provider_signer_id: string | null;
  sent_at: string | null;
  signed_at: string | null;
}

export type SignatureSessionStatus = "pending" | "completed" | "declined";

export interface QuoteSignatureSession {
  id: string;
  quote_id: string;
  provider: string;
  provider_document_id: string | null;
  status: SignatureSessionStatus;
  signed_document_url: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Joined / view types ─────────────────────────────────────────────────────

export interface QuoteWithRelations extends Quote {
  client: Client;
  scenarios: (QuoteScenario & { line_items: QuoteLineItem[] })[];
  signers: QuoteSigner[];
  signature_session: QuoteSignatureSession | null;
}

export interface ProductWithCategory extends Product {
  category: ProductCategory | null;
  pricing_tiers: ProductPricingTier[];
}

// ─── Supabase DB helper type ──────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      tenants: { Row: Tenant; Insert: Omit<Tenant, "id" | "created_at">; Update: Partial<Omit<Tenant, "id">> };
      tenant_settings: { Row: TenantSettings; Insert: Omit<TenantSettings, "id">; Update: Partial<Omit<TenantSettings, "id">> };
      users: { Row: User; Insert: Omit<User, "created_at">; Update: Partial<Omit<User, "id">> };
      clients: { Row: Client; Insert: Omit<Client, "id" | "created_at">; Update: Partial<Omit<Client, "id">> };
      product_categories: { Row: ProductCategory; Insert: Omit<ProductCategory, "id">; Update: Partial<Omit<ProductCategory, "id">> };
      products: { Row: Product; Insert: Omit<Product, "id" | "created_at">; Update: Partial<Omit<Product, "id">> };
      product_pricing_tiers: { Row: ProductPricingTier; Insert: Omit<ProductPricingTier, "id">; Update: Partial<Omit<ProductPricingTier, "id">> };
      templates: { Row: Template; Insert: Omit<Template, "id" | "created_at">; Update: Partial<Omit<Template, "id">> };
      quotes: { Row: Quote; Insert: Omit<Quote, "id" | "created_at" | "updated_at">; Update: Partial<Omit<Quote, "id">> };
      quote_scenarios: { Row: QuoteScenario; Insert: Omit<QuoteScenario, "id">; Update: Partial<Omit<QuoteScenario, "id">> };
      quote_line_items: { Row: QuoteLineItem; Insert: Omit<QuoteLineItem, "id">; Update: Partial<Omit<QuoteLineItem, "id">> };
      quote_signers: { Row: QuoteSigner; Insert: Omit<QuoteSigner, "id">; Update: Partial<Omit<QuoteSigner, "id">> };
      quote_signature_sessions: { Row: QuoteSignatureSession; Insert: Omit<QuoteSignatureSession, "id" | "created_at">; Update: Partial<Omit<QuoteSignatureSession, "id">> };
    };
  };
}
