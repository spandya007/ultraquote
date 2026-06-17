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
