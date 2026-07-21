import { LoginForm } from "@/components/ui/login-form";
import { LegalLinks } from "@/components/legal/legal-links";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const idle = (await searchParams)?.reason === "idle";
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="SmartProps" className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-sm" />
          <h1 className="text-3xl font-bold tracking-tight">SmartProps</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account</p>
        </div>
        {idle && (
          <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300 px-4 py-3 text-sm text-center">
            You were signed out due to inactivity. Please sign in again.
          </div>
        )}
        <LoginForm />
        <LegalLinks className="mt-6" />
      </div>
    </main>
  );
}
