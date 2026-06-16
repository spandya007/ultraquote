import { ConfirmForm } from "@/components/auth/confirm-form";

// Click-to-confirm landing for invite / reset / signup links. Public (middleware
// allows /auth/*). The token is only consumed when the user clicks the button,
// so email security scanners that merely prefetch this page don't burn it.
// See docs/invite-link-scanner-design.md.
export default function ConfirmPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <ConfirmForm />
    </div>
  );
}
