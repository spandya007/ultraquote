"use client";

import { Check, X } from "lucide-react";
import { checkPassword } from "@/lib/auth/password";

// Live checklist shown beneath a new-password field. Renders nothing until the
// user starts typing.
export function PasswordRequirements({ password, email }: { password: string; email?: string }) {
  if (!password) return null;
  const checks = checkPassword(password, email);
  return (
    <ul className="space-y-0.5 mt-1">
      {checks.map((c) => (
        <li key={c.id} className={`flex items-center gap-1.5 text-xs ${c.ok ? "text-green-600" : "text-muted-foreground"}`}>
          {c.ok ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0 opacity-50" />}
          {c.label}
        </li>
      ))}
    </ul>
  );
}
