import { LoginForm } from "@/components/ui/login-form";
import { LegalLinks } from "@/components/legal/legal-links";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; redirectTo?: string }>;
}) {
  const sp = await searchParams;
  const idle = sp?.reason === "idle";
  const redirectTo = sp?.redirectTo;
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="SmartProps" className="h-12 mx-auto mb-4" />
          <h1 className="sr-only">SmartProps</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account</p>
        </div>
        {idle && (
          <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300 px-4 py-3 text-sm text-center">
            You were signed out due to inactivity. Please sign in again.
          </div>
        )}
        <LoginForm redirectTo={redirectTo} />
        <LegalLinks className="mt-6" />
      </div>
    </main>
  );
}
