# UltraQuote — Training Video Scripts (Tier 1, videos 2–11)

> Companion to [`training-videos-plan.md`](./training-videos-plan.md). Video 1 (Quick Start) is scripted last, after these are recorded.

## How to use these scripts
- **Natural voice, not read aloud.** The **SAY** lines are talking points ~close to verbatim — paraphrase them in your own words so it sounds conversational. Don't read them stiffly.
- **[DO]** = the on-screen action. **[SAY]** = what you're saying over it. **[CHAPTER]** = a Loom chapter marker.
- Keep each ≤ 4 min. Open with a 3-sec title card ("UltraQuote · <topic>"), close with the CTA line.
- **Demo data used throughout** (swap for your real recording data if you prefer):
  - Tenant **Northwind IT** · Owner narrating in first person · Member "Sam".
  - Products: **Managed Workstation** (tiers: Standard $45/user/mo, Premium $65), **Microsoft 365 Business Premium** $22/user/mo, **Onboarding & Setup** (one-time $1,500 setup fee).
  - Clients: **Riverside Dental** (has logo, secondary signer, full address), **Cascade Law**.
  - Defaults: prefix **NW**, valid **30 days**, tax **9.25%**.

---

## Video 2 · Setting up your company  ·  ~3 min · Owner

**Opening**
- **[DO]** Title card, then land on the dashboard.
- **[SAY]** "Before you send your first quote, let's set up your company once. This stuff flows automatically onto every proposal and PDF, so you only do it here."

**[CHAPTER] Company Settings**
- **[DO]** Sidebar → **Settings** → **Company Settings** card.
- **[SAY]** "Head to Settings, then Company Settings. First, your logo — this shows up on the first page of every proposal."
- **[DO]** Upload the logo; wait for the preview.
- **[SAY]** "Add your contact name, phone, and address. Quick note: **Company Name and Contact Email are locked** — those are set when your account is created and managed by UltraQuote, so don't go looking for them here."
- **[DO]** Set **Tax Rate** to 9.25%.
- **[SAY]** "Set your tax rate once, here. It's company-wide and read-only on the quote itself — so nobody can fat-finger a different rate on an individual proposal."

**[CHAPTER] Quote Defaults**
- **[DO]** Scroll to **Quote Defaults**: prefix NW, valid days 30, payment terms.
- **[SAY]** "Quote Defaults set the starting point for new quotes — your quote-number prefix, how many days a quote stays valid, and default payment terms. You can still override valid-until and terms per quote."

**[CHAPTER] See it land**
- **[DO]** Open any quote → **Preview**; point at the logo + tax line.
- **[SAY]** "And there it is — logo up top, your tax rate applied. Set once, used everywhere."

**Close**
- **[SAY]** "That's your company setup. Next up: building your product catalog."
- *Help: `/help#getting-started`*

---

## Video 3 · Building your product catalog  ·  ~4 min · Owner

**Opening**
- **[SAY]** "Your catalog is the menu you build quotes from. Let's add a product by hand, then bulk-import the rest from a spreadsheet."

**[CHAPTER] Add a product**
- **[DO]** Sidebar → **Products** → **Add Product**. Fill name "Managed Workstation", category, a short description.
- **[SAY]** "Give it a name, pick a category, and a short description your clients will actually see."

**[CHAPTER] Pricing tiers**
- **[DO]** Add tier "Standard" $45, add tier "Premium" $65. Point at the live margin.
- **[SAY]** "A product can have multiple pricing tiers — here, Standard and Premium. When you add this to a quote you'll pick the tier. Notice the margin updates live as you set cost and price."

**[CHAPTER] Setup fee**
- **[DO]** Details tab → **Setup Price** $1,500 on the "Onboarding & Setup" product.
- **[SAY]** "If a product has a one-time setup charge, put it here in Details. That flows into the quote as a one-time fee, separate from the recurring price."

**[CHAPTER] CSV import**
- **[DO]** Back to /products → **Import CSV** → open the **"CSV format"** popover → download the sample template.
- **[SAY]** "Got a big catalog already? Use Import CSV. Click 'CSV format' to see exactly what's expected — and there's a sample template to start from. Honestly the only required column is the item name; we alias-match the common header spellings."
- **[DO]** Upload the filled sample; show grouped products with tiers.
- **[SAY]** "Upload, and it groups rows into products with their tiers automatically."

**Close**
- **[SAY]** "That's your catalog. Next, let's add a client."
- *Help: `/help#products`*

---

## Video 4 · Adding clients  ·  ~2 min · Owner/Member

**Opening**
- **[SAY]** "Clients are who your quotes go to. Let's add one with everything filled in, so signing later is smooth."

**[CHAPTER] Add client**
- **[DO]** Sidebar → **Clients** → **Add Client**. Company "Riverside Dental", primary contact name/email/phone.
- **[SAY]** "Company name, and your main contact — name, email, phone. The email matters because that's who we send the signature request to."

**[CHAPTER] Logo + secondary signer**
- **[DO]** Upload client logo. Fill **secondary contact** (name/email).
- **[SAY]** "You can add the client's logo if you want it on the proposal. And here's a handy one — a **secondary contact**. This is mostly for a second signer, so if a deal needs two signatures, both are ready to go."

**[CHAPTER] Structured address**
- **[DO]** Fill street, suite, city, state, postal, country.
- **[SAY]** "Fill the address in these structured fields — it composes cleanly onto the proposal. Then Save."
- **[DO]** Mention **Import CSV** button for bulk.
- **[SAY]** "And just like products, there's a CSV import if you're bringing over a whole client list."

**Close**
- **[SAY]** "Client's in. Now the fun part — building the quote."
- *Help: `/help#getting-started`*

---

## Video 5 · Creating a quote  ·  ~4 min · Owner/Member

**Opening**
- **[SAY]** "Let's build a quote from scratch and add line items — some from your catalog, some custom."

**[CHAPTER] New quote**
- **[DO]** Sidebar → **Quotes** → **New Quote** → Start from **Blank** → pick client Riverside Dental.
- **[SAY]** "New Quote. You can start blank or from a template — we'll do blank. Pick the client, and it gives us a quote number automatically using your prefix."
- **[DO]** Edit the title; point at the auto-save indicator and the status badge.
- **[SAY]** "Name it whatever helps you. Two things to notice: there's **no Save button — everything auto-saves**, see the little 'Saved' indicator. And the status badge up here is read-only; the system manages it as the quote gets sent and signed."

**[CHAPTER] Add from catalog**
- **[DO]** **Add from catalog** → spotlight search "Managed Workstation" → pick it → choose **Premium** tier → qty 10.
- **[SAY]** "Add from catalog opens this quick search. Find your product, and for a multi-tier product you pick the tier right here. Set the quantity — ten workstations."
- **[SAY]** "One thing worth knowing: line items **snapshot** the price at the moment you add them, so a quote you sent last month won't change if you update your catalog today."

**[CHAPTER] Free-text line**
- **[DO]** **Add free-text item** → "Custom firewall config" → qty 1, price $400.
- **[SAY]** "Need something that's not in your catalog? Add a free-text item and type whatever you want."

**[CHAPTER] Right panel**
- **[DO]** Show right panel: client card, valid-until, payment terms.
- **[SAY]** "Over on the right: your client info, the valid-until date, payment terms. Set and forget — it's all saving as you go."

**Close**
- **[SAY]** "That's a basic quote. Next, let's turn this into good-better-best options with scenarios."
- *Help: `/help#quotes`*

---

## Video 6 · Scenarios & the "Recommended" option  ·  ~3 min · Owner/Member

**Opening**
- **[SAY]** "Scenarios let you put good-better-best options in a single quote, so the client chooses instead of you sending three separate PDFs."

**[CHAPTER] Add scenarios**
- **[DO]** On the scenario tabs, **add** a scenario; rename to "Essentials"; add a second "Complete".
- **[SAY]** "Each tab is a scenario. I'll rename this one 'Essentials', and add a second called 'Complete' with more in it."
- **[DO]** In "Complete", add extra line items (e.g. M365 Premium, backup).
- **[SAY]** "In Complete I'll add the extras — the fuller package."

**[CHAPTER] Recommended**
- **[DO]** **Star** the "Complete" scenario as Recommended.
- **[SAY]** "Star the one you want to steer them toward — that's marked Recommended and gets highlighted for the client."

**[CHAPTER] Totals**
- **[DO]** Point at per-scenario **Monthly / One-time** totals in the right panel; switch tabs to show them change.
- **[SAY]** "Each scenario has its own monthly and one-time totals, right here — switch tabs and watch them update."
- **[DO]** (Optional) point at **Refresh prices from catalog**.
- **[SAY]** "And if your catalog prices change later, 'Refresh prices from catalog' re-pulls them across every scenario at once."

**Close**
- **[SAY]** "Scenarios are your options. Next, let's fine-tune the money — discounts, setup fees, and tax."
- *Help: `/help#quotes`*

---

## Video 7 · Discounts, setup fees & tax  ·  ~3 min · Owner/Member

**Opening**
- **[SAY]** "Let's talk money details — how discounts, one-time setup fees, and tax play together."

**[CHAPTER] Discounts**
- **[DO]** In the **Disc** column, apply **10%** to a line. Then switch a different line to **$** and enter $150.
- **[SAY]** "Each line has a discount column. You can do a percentage — 10% off — or switch to a flat dollar amount. It's one or the other per line, not both."
- **[DO]** Preview → point at the green **"You save $X"** row.
- **[SAY]** "On the client's side, discounts show up as a friendly 'you save' line — nice for closing."

**[CHAPTER] Setup fees**
- **[DO]** Point at a line with a setup fee folding into the **one-time total**.
- **[SAY]** "Remember that setup fee from the catalog? It lands in the one-time total, separate from the recurring price — and setup fees are **not** discounted."

**[CHAPTER] Tax**
- **[DO]** Point at the tax line; note the rate is read-only.
- **[SAY]** "Tax uses your company rate — read-only here, so it's consistent. And everything, tax and margins included, calculates on the **discounted** price."

**[CHAPTER] Margins (internal)**
- **[DO]** Toggle the **margins** column on, then OFF.
- **[SAY]** "Quick warning — this margins toggle is for your eyes only. Turn it off before you show or send anything, so your cost never ends up in front of a client."

**Close**
- **[SAY]** "Money's dialed in. Now let's write the actual proposal."
- *Help: `/help#quotes`*

---

## Video 8 · Writing the proposal (Document tab)  ·  ~4 min · Owner/Member

**Opening**
- **[SAY]** "The Document tab is where you write the proposal narrative around your pricing — the cover, the intro, the scope. Let's build one."

**[CHAPTER] The editor**
- **[DO]** Switch to the **Document** tab. Type a heading + a paragraph; show lists + alignment.
- **[SAY]** "It's a full document editor — headings, lists, bold, alignment, all the usual. And it auto-saves on its own, separate from the quote data."

**[CHAPTER] Insert Field (variables)**
- **[DO]** **Insert Field** → `{{client.company_name}}`, then `{{tenant.logo}}`.
- **[SAY]** "Instead of typing the client's name, insert a field — like client company name. It shows a live preview now, and fills in the real value on the final PDF. There are fields for your company too, including your logo."

**[CHAPTER] Images + two-column**
- **[DO]** Insert an image. Then insert a **two-column** layout; show the dashed column borders; put text in each side.
- **[SAY]** "Drop in images wherever. And new here — a **two-column layout**. See the faint dashed borders? Anything you put in the left and right columns sits side by side on the page. Great for feature lists or comparisons."

**[CHAPTER] Page break**
- **[DO]** Insert a **page break**.
- **[SAY]** "A page break forces a clean start — handy before your pricing or terms section."

**Close**
- **[SAY]** "One note: the editor follows your light or dark theme, but the final PDF is always your clean, branded light version. Next, let's drop live pricing into this document."
- *Help: `/help#document`*

---

## Video 9 · Adding pricing tables to the document  ·  ~2 min · Owner/Member

**Opening**
- **[SAY]** "Your pricing doesn't appear in the proposal automatically — you place it exactly where you want it. Here's how."

**[CHAPTER] Insert a pricing table**
- **[DO]** Document → **Insert** menu → **Pricing table**.
- **[SAY]** "In the Document, open Insert and choose Pricing table."
- **[DO]** Choose **Recommended**; then show the **All / specific scenario** options.
- **[SAY]** "Pick what it shows — just your Recommended scenario, all of them side by side, or one specific scenario. I'll show the Recommended one."

**[CHAPTER] It's live**
- **[DO]** Show the in-editor live preview; then bounce to the quote, tweak a price, come back.
- **[SAY]** "This table is **live** — it's a reference to your pricing, not a frozen snapshot. Change a price on the quote and the table updates itself. No copy-paste, no stale numbers."
- **[DO]** **Preview** to confirm discounts/setup/tax render.
- **[SAY]** "Preview to confirm — discounts, setup fees, tax, all carried through."

**Close**
- **[SAY]** "Pricing's in the doc. Next, let's preview and generate the PDF."
- *Help: `/help#document`*

---

## Video 10 · Preview & PDF  ·  ~2 min · Owner/Member

**Opening**
- **[SAY]** "Before you send, always preview. Let's look at the finished proposal and grab the PDF."

**[CHAPTER] Preview**
- **[DO]** Click **Preview** → full-screen modal. Scroll through.
- **[SAY]** "Preview opens the full proposal exactly as the client sees it. It flushes your latest edits first, so this is always current."

**[CHAPTER] Header/footer toggle**
- **[DO]** Right panel → **PDF Options** → toggle **running header/footer**.
- **[SAY]** "Over in PDF Options you can turn the running header and footer on or off — your company name and page numbers on every page."
- **[SAY]** "Heads up: that header and footer are **print-only**. You won't see them in this on-screen preview — only in the downloaded PDF. That's expected, not a bug."

**[CHAPTER] Download**
- **[DO]** Click **Download PDF**; open the file; point at header/footer.
- **[SAY]** "Download the PDF — and there's the header and footer on the actual pages."

**Close**
- **[SAY]** "Looks good? Let's send it for signature."
- *Help: `/help#document`*

---

## Video 11 · Sending for signature (DocuSeal)  ·  ~4 min · Owner/Member

**Opening**
- **[SAY]** "The final step — sending your quote for e-signature. Let's add signature fields and send it."

**[CHAPTER] Add signature fields**
- **[DO]** Document → **Insert** → **Signature** → signer = **Client**. Add a second for **Company**.
- **[SAY]** "In the Document, Insert a Signature field and choose who signs — the client, or your company for a counter-signature."
- **[DO]** (Optional) Insert an **acceptance checkbox** and an **initials** field.
- **[SAY]** "You can also add initials, an acceptance checkbox, or a multiple-choice question. Quick tip — keep any option labels short so they render cleanly."

**[CHAPTER] Send flow**
- **[DO]** Click **Send for signature** → modal. Show signers prefilled; sequential vs parallel; custom message.
- **[SAY]** "Hit Send for signature. Your signers are already filled in from the client. Choose whether they sign in order or at the same time, and add a personal message for the email."
- **[DO]** Send.

**[CHAPTER] Status lifecycle**
- **[DO]** Show the badge flip to **sent**.
- **[SAY]** "And it's sent. Watch the status — it's fully automatic. It'll move to 'viewed' when they open it, then 'signed' when everyone signs. You never set it by hand."
- **[SAY]** "Two things: you can't send a quote whose valid-until date has passed — just extend it first. And once it's signed, that's the locked, executed version."

**Close**
- **[SAY]** "That's the full journey — from a blank quote to a signed deal. Check the other videos for the power features like scenarios, AI writing, and templates."
- *Help: `/help#sending`*

---

## Recording notes (all videos)
- Record against the **Northwind IT** demo tenant. Never a real client email on the Send video — DocuSeal is on the sandbox; use a demo inbox.
- Turn the **margins** column off before any Preview/PDF/Send shot.
- Make sure `PDF_SERVICE_URL` is set in the demo env before recording video 10 (PDF download 501s otherwise).
- Record 2 → 11 in order (data builds up), then record video 1 (Quick Start) last.
