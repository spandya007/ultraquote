// Footer links to the public legal pages. Plain anchors (full navigations to
// the standalone, light-rendered legal pages). Reused on login, set-password,
// and the accept-terms gate.
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`text-center text-xs text-muted-foreground ${className}`}>
      <a className="hover:text-foreground hover:underline" href="/terms">Terms of Service</a>
      <span className="mx-1.5">·</span>
      <a className="hover:text-foreground hover:underline" href="/privacy-policy">Privacy Policy</a>
      <span className="mx-1.5">·</span>
      <a className="hover:text-foreground hover:underline" href="/cookie-policy">Cookie Policy</a>
    </div>
  );
}
