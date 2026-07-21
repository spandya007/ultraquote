import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";

// Login MFA gate (the dashboard/admin layouts redirect here when an AAL1
// session has an unverified-this-session 2FA factor). Public route
// (middleware allows /auth/*); the form requires the AAL1 session.
export default function MfaChallengePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="SmartProps" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-sm" />
          <h1 className="text-2xl font-bold tracking-tight">Two-step verification</h1>
          <p className="text-muted-foreground mt-2 text-sm">Enter the code from your authenticator app.</p>
        </div>
        <MfaChallengeForm />
      </div>
    </main>
  );
}
