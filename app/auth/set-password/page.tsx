import { SetPasswordForm } from "@/components/auth/set-password-form";
import { LegalLinks } from "@/components/legal/legal-links";

// Landing page for invite links. The session arrives as #access_token tokens
// in the URL hash (Supabase implicit flow) — the server never sees them, so
// this page is public (middleware allows /auth/*) and the client component
// establishes the session, then asks for a password.
export default function SetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/20 p-4">
      <SetPasswordForm />
      <LegalLinks className="mt-6" />
    </div>
  );
}
