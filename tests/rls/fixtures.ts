// Fixed UUIDs seeded by supabase/seed-test.sql. Two isolated tenants, each with
// an owner and a member.
export const T = {
  A: "00000000-0000-0000-0000-0000000000a0",
  B: "00000000-0000-0000-0000-0000000000b0",
  aOwner: "00000000-0000-0000-0000-0000000000a1",
  aMember: "00000000-0000-0000-0000-0000000000a2",
  bOwner: "00000000-0000-0000-0000-0000000000b1",
  bMember: "00000000-0000-0000-0000-0000000000b2",
} as const;

// Org-layer fixture UUIDs (migration 019/020). Not seeded globally — tests that
// need them create the rows inside their own rolled-back transaction.
export const ORG = {
  one: "00000000-0000-0000-0000-00000000005a",
  // An auth.users id used as an Org Admin principal (organization_admins.user_id
  // FKs auth.users). Created in-transaction via seedAuthUser().
  adminAuthUser: "00000000-0000-0000-0000-00000000005b",
} as const;
