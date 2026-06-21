import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, FileText, PenLine, Send, Package, Users, BookTemplate, Settings, UserCog, CalendarClock,
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
      {
        heading: "Deleting quotes",
        ownerOnly: true,
        blocks: [
          p("Deleting is owner-only and off by default. On the Quotes list, click “Enable delete” to turn it on for 30 seconds (a countdown shows); it then turns itself back off. While it’s on, a Delete button appears on each row and you can remove several quotes within the window."),
          p("Only Draft or Declined quotes can be deleted — quotes that are sent, viewed, signed, or expired are kept (a signed quote is a real record, and an expired one was a real offer). Deleting a quote permanently removes it along with all of its scenarios, line items, and signing records. This cannot be undone."),
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
          p("The Document tab is a rich editor for the proposal narrative. Use the Insert menu in the toolbar to add a pricing table, signature, or page break, or a client/company detail — just click, no commands to type."),
          p("Prefer the keyboard? Typing “/” still opens a quick menu of headings, lists, images, and the same building blocks."),
          p("Everything auto-saves as you type."),
        ],
      },
      {
        heading: "Inserting building blocks (pricing, signature, initials, choice, acceptance, page break)",
        blocks: [
          p("Open the toolbar Insert menu → Building blocks → choose Pricing table, Signature, Initials, Multiple choice, Acceptance checkbox, or Page break. The block is added where your cursor is. After inserting, a pricing table lets you pick which scenario to show, and a signature or initials block lets you pick who signs."),
          p("A Multiple choice block asks a question with options the signer must pick one of at signing time (e.g. “Preferred term: Monthly, Annual”). Type the question and the options separated by commas. The question you type becomes the field title the signer sees."),
          p("Keep each option short — a few words (ideally under ~30 characters). Options render as small labelled boxes in the signed PDF, so long options wrap awkwardly. Put any explanation in the question or a paragraph above the block, and keep the options to concise choices (e.g. question “Data backup plan” with options “Daily (30-day)”, “Weekly (90-day)”, “None”)."),
          p("An Acceptance checkbox is a statement the customer must agree to (e.g. “I have read and accept the terms”). Type the statement, and at signing time the customer must check it before they can sign — add more than one if needed; all are required."),
        ],
      },
      {
        heading: "Inserting client / company details",
        blocks: [p("Use the toolbar Insert menu → Client & company details to drop in fields like the client’s company name or your phone number. They fill in with the real values when the proposal is previewed or downloaded.")],
      },
      {
        heading: "Pricing tables in the document",
        blocks: [p("Add a pricing table from the Insert menu (Building blocks → Pricing table) to show a scenario’s pricing inside the document. It stays live — if you change line items, the table updates. Pricing is optional; it only appears where you place a table.")],
      },
      {
        heading: "Two-column layout",
        blocks: [
          p("The quickest way: select the block(s) you want side by side and click the two-column button (⫼) in the toolbar — they’re split into two columns. You can also type “/” and choose Two Columns (or Three Columns), or drag a block to the left/right edge of another block. Drag the divider between columns to resize them."),
          p("Two-column sections render in the Preview and PDF as well. Tip: keep columns for short, parallel content (e.g. two short lists); very wide tables or pricing tables read better full-width."),
        ],
      },
      {
        heading: "Working inside tables",
        blocks: [
          p("Table cells hold text only — you can’t place a heading, a bulleted/numbered list, or another block inside a cell. To put several lines in one cell, press Shift+Enter for a soft line break, and use bold for emphasis. Keep real headings and lists above or below the table (or split into separate tables with text between them)."),
        ],
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
      {
        heading: "Exporting & importing templates",
        blocks: [
          p("On the Templates page, each template has an Export button that downloads it as a .uqtemplate.json file — handy for backing up a template or sharing a polished one with another UltraQuote workspace."),
          p("Use Import template (top of the page) to add a template from a .uqtemplate.json file. It’s created as a new template in your workspace."),
          p("Note: exported templates carry the document layout and text, but any embedded images that were uploaded to your workspace won’t transfer to another workspace — re-add those after importing."),
        ],
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
          p("Add a signature where a party signs — toolbar Insert menu → Building blocks → Signature — then “Send for signature.” The client and your company each receive an email to sign electronically."),
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
        heading: "Organizing with categories",
        ownerOnly: true,
        blocks: [
          p("Manage your product categories in Settings → Product Categories: add, rename, reorder, or delete them. Categories are your own internal grouping for filtering the catalog — they don’t appear on client proposals, and you can change them anytime."),
          p("Deleting a category doesn’t delete its products — they simply become “Uncategorised,” and you can recategorize them whenever you like. (Type — Service/Hardware/Software/Other — is a separate, fixed product field.)"),
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
    icon: UserCog,
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
      {
        heading: "Pausing a user (Enable / Disable)",
        ownerOnly: true,
        blocks: [
          p("On Settings → Team you can Disable any team member to immediately block their access — useful when someone leaves or is away — without deleting them or their quotes. Toggle them back to Enable to restore access instantly. You can’t disable yourself (the owner)."),
          p("Disabling is different from revoking an invite: revoke is for people who haven’t accepted yet; disable is for active users. (For subscription expiry and account access, see Subscription & access.)"),
        ],
      },
    ],
  },
  {
    id: "subscription",
    title: "Subscription & access",
    icon: CalendarClock,
    sections: [
      {
        heading: "Your subscription",
        ownerOnly: true,
        blocks: [
          p("Settings → Subscription shows your plan’s start and end dates. Everyone on your team shares the same subscription period — when you add a new user, their access runs to the same end date as everyone else’s."),
          p("You’ll see a reminder banner when your subscription is within 7 days of ending. Subscription dates are managed by UltraQuote — to renew or change your plan, contact UltraQuote."),
        ],
      },
      {
        heading: "After the end date (read-only grace)",
        ownerOnly: true,
        blocks: [
          p("If your subscription lapses, your team isn’t locked out immediately. For a short grace period everyone can still view quotes and data but can’t create, edit, or send — a red banner shows how long you have. Renewing restores full access; if the grace period passes without renewal, access is paused until you renew."),
        ],
      },
      {
        heading: "If your team can’t sign in",
        blocks: [
          p("Access can be paused for a few reasons — the screen will say which: your subscription has ended, a user was disabled on the Team page (see Your team & permissions), or UltraQuote has suspended the account. Contact UltraQuote if your whole team is locked out."),
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
        heading: "Proposal font",
        ownerOnly: true,
        blocks: [
          p("Settings → Quote Defaults → Proposal Font sets the typeface for your proposals — choose Sans-serif (Helvetica/Arial), Serif (Times New Roman), or Monospace (Courier). It’s a company-wide setting that applies to every quote."),
          p("The font shows everywhere the proposal is rendered: while editing the Document, in the Preview and downloaded PDF, and in the e-signature document. Reload an open quote after changing it. (The choice is limited to these three so it renders reliably in both the PDF and the signing document.)"),
        ],
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
