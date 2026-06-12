# User Documentation Notes (draft)

Working notes to fold into end-user help later. Not polished docs yet.

---

## Dashboard (home)

The landing page summarizes your pipeline:

- **Top cards:** Open pipeline (total value of open quotes — draft/sent/viewed),
  Monthly recurring for open quotes, Won (value of signed quotes) with win rate,
  and Active clients. Values use each quote's **recommended scenario** (or the
  first scenario if none is marked recommended).
- **Quotes by status:** a bar breakdown of how many quotes are in each status.
- **Expiring soon:** open quotes whose "valid until" date is within 14 days (or
  overdue) — click to open.
- **Recent quotes:** your latest quotes with status and value; click to open, or
  "View all" to go to the Quotes list.

## The Quote model (overview)

A **Quote** is the central object. Each quote has two complementary parts, shown
as tabs in the quote editor:

1. **Pricing Scenarios tab** — the structured pricing data (what you're selling
   and for how much), organized into Scenarios with line items.
2. **Document tab** — the narrative proposal (cover letter, scope, terms) written
   in a rich-text editor.

A quote also carries metadata in the right-hand panel (valid-until date, the
company tax rate shown read-only, payment terms, internal notes) and a **status** (Draft, Sent, Viewed,
Signed, Declined, Expired).

## Quote lifecycle (statuses)

**Statuses are managed by the system — there is nothing to set manually.** The
colored badge in the quote header (and on the Quotes page) updates on its own;
hover it for an explanation of the current state.

- **Draft** — every new quote starts here (including copies made with Duplicate).
- **Sent** — set when you click **Send for signature** (or re-send).
- **Viewed** — a signer opened the document (hover the badge for per-signer progress).
- **Declined** — a signer declined (hover the badge for their comment). Edit and
  re-send to start a new round.
- **Signed** — all parties signed. **This is final**: the status can never change
  again. A green **Signed PDF** button appears to download the executed document.
  To revise a signed deal, use **Duplicate** — it creates a new quote at Draft.
- **Expired** — automatic: a sent/viewed quote past its **Valid Until** date shows
  as Expired. **Extending the date reactivates it** (no button needed). Drafts
  never expire. You can't send a quote whose Valid Until has passed — extend the
  date first.

**Older drafts are tidied away automatically:** a draft with no activity for
longer than your **Default Valid Days** (Settings → Quote Defaults, default 30)
is hidden from the Quotes page and Dashboard. A note on the Quotes page shows how
many are hidden; to see them again, temporarily raise Default Valid Days in
Settings. (Hidden drafts are never deleted — editing a draft resets its clock.)

**Everything auto-saves** — there is no Save button. A "Saving… / Saved ✓"
indicator in the top bar shows progress. Line item edits save instantly;
text/metadata edits save about a second after you stop typing.

**Other quote actions:**
- **New Quote** — from the Quotes list; pick a client, optionally a title.
- **Duplicate** — the Duplicate button on a quote row copies everything
  (scenarios, line items, and the document) into a fresh **Draft** with a new
  quote number and " (Copy)" appended to the title.
- **Preview** / **Download PDF** — see those sections below.

---

## Scenarios (in the Pricing Scenarios tab)

Scenarios let you present **options** to the client (e.g. "Essentials" vs.
"Complete"). Up to **5** per quote.

- **Add Scenario** / rename inline / **delete** (trash icon).
- **Recommended** (star icon) — mark one scenario as recommended. It's
  highlighted and labelled "Recommended" in pricing tables.
- **Deleting a scenario** asks for confirmation and warns you if:
  - it's the recommended one (another scenario is auto-promoted to recommended), or
  - a pricing table in the Document references it (so you can fix that table).
- Each scenario is color-coded; the same color follows it into the Document's
  pricing tables.

## Line items

Within a scenario, add line items two ways:
- **Add from catalog** — search your product catalog; multi-tier products show
  tier buttons.
- **Add free-text item** — a blank row for custom entries.

Each row has a description, billing period (**Monthly** or **One Time**),
quantity, unit price, a **Disc %** (discount), and an auto-calculated total.
Scenario totals (monthly recurring, one-time, tax, grand total) compute
automatically on the **discounted** prices.

**Discounts:** use the **Disc** column to discount a line — enter a value and
pick **%** (percent of the line) or **$** (a fixed dollar amount off the line
total) from the little selector; each line uses one or the other. The line
total, tax, and margins all use the discounted price. On the client-facing quote
(Preview/PDF and document pricing tables), a **Discount column appears
automatically** whenever any line has a discount — showing the regular unit
price, the discount (e.g. −10% or −$50.00), the discounted total, and a green
**"You save $X"** row in the totals, so the client sees the value they're
getting.

**Taxable items:** if a scenario contains at least one taxable item, a **Tax**
column appears showing the calculated tax per line (line total × your company
tax rate from Settings → Company Settings); non-taxable lines show "—". The tax sum appears
in the totals at the bottom. Whether an item is taxable comes from its **catalog
product** (set on the Products page); scenarios with no taxable items show no
Tax column.

## Profit margins

Toggle **Profit margins** in the top bar to show internal **cost & profit margin**
information. (This is *business* profit margin — not document page margins.)

- In the **Pricing Scenarios** tab it adds a **Cost** column and a **Margin %** column
  (color-coded: green ≥30%, amber ≥15%, red below).
- In the right-hand **Scenario Totals** panel (visible in both the Pricing
  Scenarios and Document tabs) each scenario shows its overall **Margin %**, so you can see
  per-scenario margins even while writing the Document.
- Inline **pricing tables** placed in the Document (`/pricing`) also show a
  per-line **margin column** while the toggle is on. This is an editor-only
  view — margins are **never** included in the generated Preview/PDF.
- Margin % is calculated only over line items that have a cost set; items without
  a cost are excluded (shows "—" if no costs are set).
- Margins are **internal only** — they never appear in the Preview or PDF.
- The toggle is saved per-quote.

---

## Document tab (proposal narrative)

A rich-text editor for the proposal body.

**Toolbar layout:** the toolbar is split into two zones.
- **Left — editing tools** (used while writing): Undo/Redo, text alignment,
  **Insert Field**, and the "Type `/` for blocks" hint.
- **Right — feature actions**: **Ask AI**, **Import**, and **Extract pricing**.
- The **Saved ✓ / Saving…** status sits at the far right.

- **Formatting** — type `/` for a block menu (headings, lists, etc.); select text
  for inline formatting (bold, italic, …). Alignment buttons and Undo/Redo are in
  the toolbar.
- **Insert Field** — drop in placeholders like client company name, contact,
  email, phone, address, and the same for your own company. These are filled with
  real values in the Preview/PDF. **Logo** is also a field: `{{client.logo}}` and
  `{{tenant.logo}}` render as the uploaded logo image in the Preview/PDF — so a
  **template** can include the client's logo and it fills in per quote. (Upload a
  client logo on the Clients page; your own logo in Settings.)
- **Pricing Table** (`/pricing`) — insert a live pricing table anywhere in the
  document. Choose which scenario it shows (Recommended, All, or a specific one).
  It stays in sync as you edit line items — it's a live reference, not a snapshot.
  *Pricing is optional:* if you place no pricing table, the proposal simply has no
  prices (you'll get a heads-up warning when previewing).
- **Page Break** (`/page break`) — force a new page in the PDF at that point.
- **Images** — upload images into the document.
- **Import** — bring in an existing **Word (.docx)**, **HTML (.html/.htm)**, or
  **Markdown (.md/.txt)** file. Click **Import** in the toolbar and choose a file;
  its content is converted to editable blocks (headings, lists, formatting, links,
  images, and tables). If the document is empty it's filled; otherwise the content
  is inserted at your cursor. Use **Undo** if you don't like the result.
  *(Formatting maps as closely as possible — headings, lists, bold/italic, links,
  and images carry over; very complex Word layouts may simplify.)*
- **Extract pricing → scenarios** — if your imported document has **pricing
  tables**, click **Extract pricing** in the toolbar. The system reads the tables
  (AI-assisted), proposes one **scenario** per pricing table with line items, and
  opens a **review window**. Nothing is created until you confirm. See "Turning
  document pricing into scenarios" below.
- **Ask AI** — see below.

## Ask AI (writing assistant)

The **Ask AI** button in the Document toolbar helps you write.

- **Edit selected text:** highlight text first, then choose **Improve writing**,
  **Make longer**, **Make shorter**, **Fix spelling & grammar**, or **Change tone**.
- **Generate new text:** type an instruction (e.g. "Write an executive summary")
  and click **Generate at cursor**, or click **Continue writing** to extend from
  where you left off.
- Every result opens a **review window** showing the original (for edits) vs. the
  suggested text. Click **Replace/Insert** to apply or **Discard** to cancel —
  nothing changes until you accept. Use **Undo** to revert after applying.
- The AI is aware of the deal (client, your company, pricing) when generating, so
  drafts are tailored.

**If you see "The AI service is busy right now. Please try again in a moment":**
this is a temporary hiccup on the AI provider's side (the model was momentarily
overloaded), not an error with your document or data. The app automatically
retries a couple of times first; if you still see the message, just wait a few
seconds and click again. The same applies to **Extract pricing** and any other
AI action.

---

## Preview

The **Preview** button opens a full-screen view of the rendered proposal as the
client will see it (cover page, narrative, any pricing tables). It reflects your
latest edits.

Note: the running header/footer (see below) are **print-only** and do **not**
appear in the on-screen Preview — only in the downloaded PDF.

## Download PDF

**Download PDF** generates the final PDF. Page breaks, pricing tables, inserted
fields, images, and your logo are all rendered.

## Header & Footer (PDF)

Generated PDFs include a running **header** and **footer** on every page **after
the cover (page 1)**:

- **Header:** your company name (left) and the quote number (right).
- **Footer:** a confidentiality line (left) and "Page X of Y" (right).
- The **cover page has no header/footer**, and page numbering starts at 1 on the
  second page.

Turn this off per-document with the **Header & footer** checkbox under **PDF
Options** in the quote's right-hand panel (default: on). Off = a clean document
with no header/footer on any page.

---

## Templates

Reusable proposal documents so you don't start every quote from scratch.

- **Create a template:** in a quote's **Document** tab, build the content you want,
  then use the **Templates** button → type a name → **Save current document**.
- **Apply a template:** in a quote's Document tab, **Templates** → pick one under
  "Apply a template." It fills an empty document, or inserts at your cursor
  (use **Undo** if needed).
- **View / edit a template:** on the **Templates** page, click **Open editor** on a
  template to edit its content in the full document editor (formatting, fields,
  page breaks, pricing-table placeholders, import, Ask AI). Changes auto-save.
- **Manage templates:** the **Templates** page (left nav) lists all templates —
  rename them, edit their description, or delete.

Templates store the document layout (text, fields, page breaks, pricing-table
placeholders). When applied to a quote, pricing tables set to "Recommended" or
"All" automatically reference that quote's own scenarios.

**What a template does NOT include:** scenarios, line items, or pricing. Those are
per-quote data — a template only reuses the *write-up*. To clone an entire deal
including its pricing, use **Duplicate** on the Quotes list instead. (A template's
pricing tables are placeholders that fill in from each quote's own scenarios.)

## Turning document pricing into scenarios

After importing a Word/Markdown doc that contains pricing tables, use
**Extract pricing** (Document toolbar) to convert those tables into structured
**Scenarios** with line items.

1. The system detects pricing tables (ignoring non-pricing tables like contact
   or schedule tables) and proposes a scenario per table.
2. A **review window** lets you rename scenarios, include/exclude them, and
   decide what each line item does in your **Product Catalog**:
   - **In catalog (duplicate):** if an item already exists in your catalog, it's
     flagged and defaults to **using the catalog version** (the catalog's price
     and details win). You can override if it's not actually the same item.
   - **New item:** defaults to **adding it to your Product Catalog** under the
     **Professional Services** category, so you don't have to re-enter it later.
   - **Custom:** keep it as a one-off line item that is *not* added to the catalog.
3. Click **Create scenarios**. If any line items would **add new products to your
   catalog**, you're asked to **confirm first** (it tells you how many will be
   added). Confirm to proceed.
4. After it runs, a message tells you what happened — e.g. *"Created 3 scenarios ·
   added 9 new products to your catalog."* You're taken to the Pricing Scenarios
   tab with the new scenarios. Up to **5 scenarios** per quote.

Items added to the catalog this way are recorded with their origin (which quote/
document they came from), so auto-created entries are traceable. The same service
appearing in multiple scenarios is added to the catalog **once** (each line item
keeps its own quoted price).

## Product Catalog — how items get added

Your **Product Catalog** (Products page) is the reusable list of services/
products you sell — each with pricing (and optional pricing tiers), category, and
cost (for margins). Line items in a quote can come from the catalog or be custom.

There are now **two ways** to populate your Product Catalog (besides editing it
directly on the Products page):

1. **CSV import** — bulk-import products from a spreadsheet (Products page →
   Import CSV). Best for initial setup / bulk updates.
2. **From a proposal document** — the "Extract pricing → scenarios" flow above
   can add new line items to the catalog as you build quotes (mostly Professional
   Services). This avoids manual data entry and keeps the catalog growing
   organically. Duplicate items are detected and **not** re-created — the existing
   catalog entry is used instead.

System-created catalog entries keep a small history record (origin + date), so
you can tell them apart from hand-curated or CSV-imported products.

## Send for signature (e-signature)

Send a finished quote to the client for e-signature, with you counter-signing.

1. In the **Document** tab, place one or more **Signature Fields** where each
   party signs: type `/signature` and pick **Client signs here** or **My company
   signs here**. (Add one for the client and, if you want to counter-sign, one
   for your company.)
2. The **Send for signature** button appears in the quote header **once at least
   one signature field is in the document** (and disappears if you remove them
   all). Click it — the dialog shows a signer section for each party that has a
   field, pre-filled with name/email (adjust if needed).
3. **Signing order:** when both parties sign, choose the order in the dialog —
   client first (default), your company first, or send to both at the same time.
3a. **Email subject & message:** the dialog pre-fills a professional subject and
   message (built from your company name and the quote) — edit them freely before
   sending. The `{{submitter.link}}` placeholder becomes the secure signing link
   (it's added automatically if you remove it). Replies to the email go to your
   company email address.
4. The signer(s) get an email with a signing link. As they act, the quote status
   updates automatically: **sent → viewed → signed** (or **declined**). The
   signed PDF is captured when complete.
5. **Signing progress:** while a quote is **sent** or **viewed**, hover over its
   status badge on the **Quotes** page to see per-signer progress, e.g.
   *"Client (a@x.com): signed ✓ · My company (b@y.com): awaiting"*. The quote
   only becomes **signed** once **all** parties have signed.
6. **If a signer declines with a comment**, the reason is recorded. On the
   **Quotes** page, hover over the red **Declined** status badge to see it as a
   tooltip, e.g. *"Declined by client@x.com: pricing too high"*.
7. **Once signed, the quote is final.** The status can no longer be changed (the
   status dropdown becomes a fixed "Signed" badge), and a green **Signed PDF**
   button appears in the quote header to download the executed document. To
   revise a signed deal, use **Duplicate** on the Quotes page — it creates a
   brand-new quote starting at **Draft**.
8. **Re-sending after a decline (or after edits):** fix up the document and click
   **Send for signature** again. A fresh signing round starts (new emails, new
   links) and the status returns to **sent**. Any links from the previous round
   are voided automatically, so nobody can sign an outdated version.

Notes:
- In the normal **Preview/PDF**, signature fields show as a plain signature line;
  the actual fillable fields only appear in the copy sent for signing.

## Settings

Settings → **Company Settings** (name, contact, email, phone, address, logo, and
the company **Tax Rate**) and **Quote Defaults** (quote-number prefix, default
valid days, default payment terms). Company info feeds the Insert Field
placeholders and the PDF header/first page. The **Tax Rate** set here applies
uniformly to taxable items on **all** quotes (it is shown read-only in each
quote's right-hand panel).

## Company Logo

**Where:** Settings → Company Settings → **Logo**.

**How it works:**
- Click **Upload** (or **Replace**) and choose an image. **PNG or SVG with a
  transparent background works best.** Max file size **2 MB**.
- The logo saves immediately (no separate "Save Profile" click needed) and a
  preview appears in Settings.
- Click **Remove** to clear it.

**Where the logo appears:**
- In the **left sidebar**, under "UltraQuote Builder for" — your logo if uploaded,
  otherwise your company name. (So the app is branded per company.)
- On the **first page** of every generated **PDF** and in the **Preview**, at the
  top of the page above the title block.
- It does **NOT** appear in the running header on pages 2+ (that header is text
  only: company name + quote number). This is intentional — keeps later pages clean.

**Tips:**
- A wide/landscape logo displays best (it's capped at ~72px tall, ~260px wide and
  scaled to fit while preserving aspect ratio).
- Transparent background avoids a white box around the logo on the page.
- The logo is shared across all quotes for the company (it's a company-level
  setting, not per-quote).

## Team (inviting your co-workers)

**Settings → Team** lists everyone in your company workspace (green **active**
badge) plus pending invites.

- **Only the owner** can invite, re-send, or revoke. Members see the list
  read-only.
- Invite by email (+ optional name). The teammate gets an email, clicks the
  link, sets a password, and lands in your workspace as a **member**.
- **Resend** replaces a not-yet-accepted invite with a fresh email (the old
  link stops working — invite links are single-use). **Revoke** cancels it.
- An email address can only belong to one workspace.

## Roles & permissions (owner vs member)

Two roles per company: the **owner** (full control) and **members**.

**Quotes are owned by whoever created them.**
- You can fully edit, send, and delete *your own* quotes.
- Teammates' quotes open **read-only** (amber banner shows who created it).
  You can still Preview and download the PDF.
- Want to build on a teammate's quote? Click **Duplicate** (in the banner or
  the Quotes list) — the copy is yours, pricing included. The Quotes list has
  a **Created by** column so you can see ownership at a glance.
- The owner can edit *every* quote.

**Templates** work the same way: anyone can apply any template to their quote
or save a new one, but only the template's creator (or the owner) can rename,
edit, or delete it.

**Owner-only areas** (members see them read-only):
- **Products** — members use the catalog in quotes but can't add/edit items,
  import CSVs, or change pricing tiers. "Extract pricing" is owner-only too.
- **Settings** — company profile, tax rate, quote defaults, Team management.
- **Clients** — members can *add* a new client (e.g. for a fresh prospect) but
  can't edit or deactivate existing ones (an edit would change every
  teammate's quotes for that client).

## Working together on the same quote (presence & live updates)

- If a teammate has the same quote (or template) open, an amber chip appears
  in the editor header: **"<name> is also in this quote"**. It updates within
  seconds as people open/close the editor.
- Saves are last-write-wins — if you both edit the *same field* at the same
  time, the later save sticks. The chip is your cue to coordinate (or just
  Duplicate the quote and work on your own copy).
- Changes a teammate saves to **pricing scenarios and line items** appear in
  your open editor automatically within a second or two — no reload needed.
  Same for status changes: if the client signs while you have the quote open,
  the badge flips to **signed** live.
- The document (narrative) tab does NOT live-sync while typing — avoid
  co-writing the same document simultaneously.

## Product Import — CSV format

**Only one column is required: `Item Name`.** Everything else is optional.

- **Recommended:** `Sell Price`, `Cost Price`, `Billing Period` (Monthly /
  One Time), `Item Type` (Service / Hardware / Software — anything else
  imports as Other).
- **Optional:** `Item Description`, `Product Category` (matched to your
  categories), `Setup Price`, `Pricing Name` + `Pricing Description`,
  `Manufacturer`, `Manufacturer Part No.`, `Supplier Name`, `Supplier SKU`.
- **Pricing tiers:** put one row per tier with the same `Item Name` — they
  merge into one product with multiple pricing options.
- **Other systems' exports:** common header spellings (Price, Unit Price,
  Vendor, SKU, Category, Description…) are recognized automatically, so many
  Autotask / ConnectWise / QuickBooks exports import without editing.
- **Re-importing:** products are matched by Item Name and updated in place —
  renaming a row creates a new product instead.
- The **CSV format** button next to Import (owner-only, Products page)
  shows this reference and offers a **sample CSV** download to fill in Excel.

## Passwords (reset & change)

- **Forgot your password?** On the sign-in page, click **Forgot password?** →
  enter your email → you get a reset link by email. The link opens a "Choose a
  new password" page; set it and you're signed in. Links are single-use and
  expire, so use the most recent email.
- **Change your password while signed in:** Settings → **Change Password** →
  enter a new password (12+ chars, mixed types) twice → Update. No email needed. Available to
  every user for their own account.

## Refresh prices from catalog

Line items remember the product's price + setup fee from the moment you added
them (so a sent quote's numbers never change underneath you). If you update a
product in the catalog afterward and want an existing quote to pick up the new
prices:

- Open the quote → **Pricing Scenarios** tab → **Refresh prices from catalog**
  (top-right of the scenario tabs row).
- It re-pulls the current **unit cost, unit price, and setup fee** for every
  catalog-linked line item across all scenarios. Your **quantities, discounts,
  descriptions, and free-text items are kept**.
- A confirmation appears first; afterward a toast says how many lines changed.
- Per-line you can always just edit the price/Setup column directly instead.
