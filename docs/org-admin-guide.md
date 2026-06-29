# UltraQuote — Organization Admin Guide

> Reference for an **Org Admin** — the person who oversees one **Organization** (a brand/reseller umbrella
> grouping several **Workspaces**). You were invited by the Platform Admin. This guide explains what you
> can and can't do. Design + roadmap: `docs/organizations-white-label-design.md`.

## Who you are

- An **Org Admin** manages **one Organization** — e.g. "CMIT" — and the **Workspaces** under it (each
  Workspace is one MSP account/office with its own owner, products, clients, and quotes).
- You are **not** a member of any Workspace. You don't create quotes or edit products; you **oversee** the
  Workspaces from a dedicated console.
- You sign in normally; if your login holds the Org Admin hat you'll see an **"Organization"** link in the
  sidebar (and pure Org Admins land on **`/org`** directly).

## The `/org` console

### What you can see
A list of every Workspace in your organization, with: **owner, # users, # quotes, status** (active /
suspended / expired), and **subscription end date**. Plus the list of **Org Admins** for your org.

You see **counts and status only** — **not** the Workspaces' quote contents or product cost/margins. That
business data stays private to each Workspace (this is the default "Oversight" visibility tier).

### What you can do
1. **Invite a new workspace** — *Invite new workspace* button. Enter the workspace name + the owner's
   email; the owner gets an invite and the workspace is created **inside your organization**. Your Platform
   Admin is **notified by email** and sets the workspace's subscription term.
2. **Suspend / re-enable a workspace** — the per-row **Suspend** button blocks **all** of that Workspace's
   users (including its owner) until you **Re-enable** it. Use it to pause an account.

### What you cannot do
- **Delete** a workspace (only the Platform Admin can — it's destructive).
- **Set or change subscriptions** (the Platform Admin owns billing/subscription windows).
- See any Workspace's **quotes, line items, or product pricing/margins**.
- Touch any Workspace **outside your organization**, or manage other Org Admins (the Platform Admin invites
  those).

## Who can do what (your view)

**Legend:** ✅ you can · ❌ you can't (someone else does it).

| Operation | You (Org Admin) | Platform Admin | Workspace Owner |
|---|---|---|---|
| See your org's workspaces + rollups | ✅ | ✅ | ❌ |
| Invite a new workspace into your org | ✅ | ✅ | ❌ |
| Suspend / re-enable a workspace | ✅ | ✅ | ❌ |
| Delete a workspace | ❌ | ✅ | ❌ |
| Set a workspace's subscription | ❌ | ✅ | ❌ |
| See quote content / product cost & margin | ❌ | ❌ | ✅ |
| Create quotes, edit products/clients | ❌ | ❌ | ✅ |
| Invite teammates (members) to a workspace | ❌ | ❌ | ✅ (the owner) |

## Notes

- **Suspending is reversible** and shared with the Platform Admin — it's one switch. A suspension you set
  is tagged so the Platform Admin can see it came from an Org Admin.
- A workspace you create starts with **no subscription window** (it works until the Platform Admin sets a
  term). The Platform Admin sees an **"Added by Org Admin"** badge as a reminder to set it.
- **Subscriptions & billing** will move to the Organization level in a later phase (one consolidated bill
  per org). For now, each Workspace's subscription is managed by the Platform Admin.
