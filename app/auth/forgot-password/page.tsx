import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

// Public (middleware allows /auth/*). Requests a Supabase recovery email.
export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="SmartProps" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-sm" />
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Enter your email and we’ll send you a reset link.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
