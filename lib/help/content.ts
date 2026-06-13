import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, FileText, PenLine, Send, Package, Users, BookTemplate, Settings,
} from "lucide-react";

// Curated, user-facing help content. Single source of truth for the in-app
// Help Center (/help). Keep it task-oriented and plain — no internal/dev detail.
// `ownerOnly` sections get an "Owner only" badge.

export interface HelpBlock { type: "p" | "ul"; text?: string; items?: string[] }
export interface HelpSection { heading: string; ownerOnly?: boolean; blocks: HelpBlock[] }
export interface HelpTopic { id: string; title: string; icon: LucideIcon; sections: HelpSection[] }

const p = (text: string): HelpBlock => ({ type: "p", text });
const ul = (items: string[]): HelpBlock => ({ type: "ul", items });

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: LayoutDashboard,
    sections: [
      {
        heading: "What UltraQuote does",
        blocks: [p("UltraQuote helps you create, send, and track professional proposals (quotes) for your clients — from pricing through e-signature.")],
      },
      {
        heading: "How a quote is structured",
        blocks: [
          p("Every quote has two parts that work together:"),
          ul([
            "Pricing scenarios — one or more priced options (each with its own line items) so a client can compare, e.g. Good / Better / Best.",
            "The proposal document — the written narrative (cover letter, scope, terms) where you can also place live pricing tables.",
          ]),
        ],
      },
      {
        heading: "The dashboard",
        blocks: [
          p("The home page summarizes your business at a glance:"),
          ul([
            "Open pipeline value and monthly recurring revenue from open quotes",
            "Win rate and active clients",
            "Quotes expiring soon (within 14 days) and your most recent quotes",
          ]),
        ],
      },
    ],
  },
  {
    id: "quotes",
    title: "Building a quote",
    icon: FileText,
    sections: [
      {
        heading: "Creating a quote",
        blocks: [p("Quotes → New Quote → pick a client. Optionally choose a template under “Start from” to begin with a ready-made document. Quote numbers are assigned automatically (e.g. CMIT-2026-001).")],
      },
      {
        heading: "Scenarios",
        blocks: [
          p("In the Pricing Scenarios tab you can add up to 5 scenarios, rename them, and star one as Recommended."),
          p("Each scenario is a self-contained set of line items, so you can offer different packages within the same quote."),
        ],
      },
      {
        heading: "Line items",
        blocks: [
          p("Add items from your product catalog or as free-text. For each line you set:"),
          ul([
            "Billing period — Monthly (recurring) or One Time",
            "Quantity and unit price",
            "Discount — a percentage or a fixed dollar amount off the line",
            "Setup — a one-time setup/onboarding fee per unit",
          ]),
          p("Monthly, one-time, tax, and total all calculate automatically as you edit."),
        ],
      },
      {
        heading: "Setup fees",
        blocks: [p("A line’s setup fee is a one-time charge (quantity × setup price) that folds into the scenario’s one-time total, shown both in the editor and on the client’s proposal. Edit it in the Setup column on any line.")],
      },
      {
        heading: "Profit margins",
        blocks: [p("Toggle “Profit margins” to see internal cost and margin per line and per scenario, color-coded (green ≥30%, yellow ≥15%, red below). This is for your eyes only — it never appears on the client’s proposal.")],
      },
      {
        heading: "Refresh prices from catalog",
        blocks: [
          p("Line items remember the product’s price and setup fee from the moment you added them, so a sent quote’s numbers never change underneath you."),
          p("If you update a product in the catalog and want an existing quote to pick up the new prices, open the quote → Pricing Scenarios → “Refresh prices from catalog.” It re-pulls current unit cost, price, and setup for every catalog-linked line; your quantities, discounts, and free-text items are kept."),
        ],
      },
    ],
  },
  {
    id: "document",
    title: "The proposal document",
    icon: PenLine,
    sections: [
      {
        heading: "Writing the document",
        blocks: [
          p("The Document tab is a rich editor for the proposal narrative. Type “/” to insert headings, lists, images, page breaks, pricing tables, and signature fields."),
          p("Everything auto-saves as you type."),
        ],
      },
      {
        heading: "Inserting client / company fields",
        blocks: [p("Use the Insert Field menu to drop in tokens like {{client.company_name}} or {{tenant.phone}}. They fill in with the real values when the proposal is previewed or downloaded.")],
      },
      {
        heading: "Pricing tables in the document",
        blocks: [p("Insert a pricing table (type “/pricing”) to show a scenario’s pricing inside the document. It stays live — if you change line items, the table updates. Pricing is optional; it only appears where you place a table.")],
      },
      {
        heading: "Ask AI",
        blocks: [
          p("The Ask AI button helps you write: improve, lengthen, shorten, fix grammar, change tone, generate from a prompt, or continue writing."),
          p("AI suggestions are shown for review (original vs suggested) so you can Replace or Discard — nothing changes until you accept it."),
        ],
      },
      {
        heading: "Importing a document",
        blocks: [p("Use Import in the Document toolbar to bring in a .docx, .md, or .txt file as a starting point.")],
      },
    ],
  },
  {
    id: "templates",
    title: "Templates",
    icon: BookTemplate,
    sections: [
      {
        heading: "What templates are",
        blocks: [p("A template is a reusable proposal document — boilerplate like your cover letter, scope language, and standard terms — that you start new quotes from instead of writing from scratch. Templates store the document narrative only, not pricing.")],
      },
      {
        heading: "Saving a document as a template",
        blocks: [p("Open a quote’s Document tab → Save as template → give it a name. It’s then available to everyone in your workspace.")],
      },
      {
        heading: "Starting a quote from a template",
        blocks: [
          p("Templates are applied when you create a quote — two ways:"),
          ul([
            "New Quote → “Start from” → pick a template",
            "Templates page → the “New quote” button on a template card (the New Quote box opens with that template preselected)",
          ]),
        ],
      },
      {
        heading: "Editing templates",
        blocks: [p("Anyone can use any template to start a quote. Only the template’s creator (or the tenant owner) can rename, edit, or delete it — others see it as view-only.")],
      },
    ],
  },
  {
    id: "sending",
    title: "Sending & quote status",
    icon: Send,
    sections: [
      {
        heading: "Quote statuses",
        blocks: [
          p("Status is managed automatically — there’s no dropdown to set it:"),
          ul([
            "Draft → Sent (when you send for signature) → Viewed → Signed or Declined",
            "Expired is shown automatically once a sent/viewed quote passes its Valid Until date — extend the date to reactivate it",
            "Signed is final; use Duplicate to start a new version",
          ]),
        ],
      },
      {
        heading: "Preview & PDF",
        blocks: [p("Preview opens the proposal exactly as the client will see it. Download PDF gives you the file. Proposals always render light/branded regardless of your app theme.")],
      },
      {
        heading: "Header & footer",
        blocks: [p("Each quote has a PDF Options toggle for a running header (company name + quote number) and footer (confidentiality line + page numbers) on every page after the cover.")],
      },
      {
        heading: "Send for signature",
        blocks: [
          p("Place a signature field in the document, then “Send for signature.” The client and your company each receive an email to sign electronically."),
          p("As they view and sign, the quote status updates automatically, and the signed PDF is captured when complete."),
        ],
      },
    ],
  },
  {
    id: "products",
    title: "Products & catalog",
    icon: Package,
    sections: [
      {
        heading: "Using the catalog",
        blocks: [p("Everyone can search the product catalog and pull items into quotes. Managing the catalog (adding, editing, importing) is done by the tenant owner.")],
      },
      {
        heading: "Adding & editing products",
        ownerOnly: true,
        blocks: [
          p("Products support multiple pricing tiers, a setup fee, and category. Each tier shows a live margin as you set its cost and sell price, so you can fine-tune pricing."),
        ],
      },
      {
        heading: "Importing products from a CSV",
        ownerOnly: true,
        blocks: [
          p("Products → Import CSV. Only an Item Name column is required; everything else is optional."),
          ul([
            "Recommended columns: Sell Price, Cost Price, Billing Period (Monthly / One Time), Item Type",
            "Common header spellings from other systems are recognized automatically",
            "Rows that share an Item Name become one product with a pricing tier each",
            "Re-importing matches by Item Name and updates in place",
          ]),
          p("The “CSV format” button on the Products page shows the full format and offers a sample template to fill in."),
        ],
      },
    ],
  },
  {
    id: "clients",
    title: "Clients",
    icon: Users,
    sections: [
      {
        heading: "Adding a client",
        blocks: [p("Clients → Add Client. Enter the company name and a primary contact (name, email, phone), plus an optional address and internal notes. Any team member can add a new client.")],
      },
      {
        heading: "Editing or deactivating a client",
        ownerOnly: true,
        blocks: [p("The tenant owner can edit an existing client’s details or deactivate one that’s no longer active (deactivated clients drop off the default list, but their past quotes are kept). Members can add new clients but not change existing ones — editing a shared client would affect everyone’s quotes for them.")],
      },
      {
        heading: "Client logo & co-branding",
        blocks: [p("Upload a client’s logo in the client drawer, then place it in a proposal with the {{client.logo}} field so the document is co-branded with both your logo and theirs.")],
      },
      {
        heading: "Using clients on quotes",
        blocks: [p("Every quote is tied to one client, chosen when you create it. The client’s details automatically fill the {{client.*}} fields you place in the proposal document.")],
      },
    ],
  },
  {
    id: "team",
    title: "Your team & permissions",
    icon: Users,
    sections: [
      {
        heading: "Inviting teammates",
        ownerOnly: true,
        blocks: [p("Settings → Team. Invite co-workers by email; they get a link to set a password and join your workspace as members. You can resend or revoke pending invites.")],
      },
      {
        heading: "Roles: owner vs member",
        blocks: [
          p("Quotes and templates are owned by whoever created them. You can fully edit your own; a teammate’s opens read-only (with a Duplicate button to make your own editable copy). The tenant owner can edit everything."),
          ul([
            "Owner-only: managing products, company settings, and editing existing clients",
            "Members can: create/edit their own quotes & templates, use the catalog, and add new clients",
          ]),
        ],
      },
      {
        heading: "Working on a quote together",
        blocks: [
          p("If a teammate has the same quote open, a chip shows “X is also in this quote.” Changes they save to scenarios and line items appear in your editor within a second or two."),
          p("Saves are last-write-wins, so coordinate (or duplicate) rather than co-typing the same document at once."),
        ],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings & account",
    icon: Settings,
    sections: [
      {
        heading: "Appearance (dark mode & themes)",
        blocks: [p("Settings → Appearance. Choose Light, Dark, or Auto (follow your device), plus an accent color. It’s per-user and applies instantly; your proposals are unaffected.")],
      },
      {
        heading: "Changing your password",
        blocks: [p("Settings → Change Password. Forgot it? Use “Forgot password?” on the sign-in page to get a reset link by email.")],
      },
      {
        heading: "Two-factor authentication (2FA)",
        blocks: [
          p("Settings → Two-Factor Authentication. Optional, per-user. Scan the QR code with an authenticator app (Google Authenticator, Authy, 1Password…), enter the 6-digit code, and save the recovery codes shown once."),
          p("Recovery codes are for when you lose your device: using one signs you in and turns 2FA off, so you’ll re-enable it afterward."),
        ],
      },
      {
        heading: "Automatic sign-out",
        blocks: [p("For security you’re signed out after 30 minutes of inactivity. Two minutes before, a prompt lets you stay signed in. Activity in any open tab keeps you signed in everywhere.")],
      },
    ],
  },
];
