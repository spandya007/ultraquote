import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@blocknote/mantine/style.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UltraQuote Builder",
  description: "Professional proposals for Managed Service Providers",
};

// next-themes mutates <html> (class) and the accent script sets data-accent —
// suppressHydrationWarning avoids the expected first-render mismatch.
const accentNoFlash = `try{var a=localStorage.getItem('ultraquote.accent');if(a)document.documentElement.dataset.accent=a;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <script dangerouslySetInnerHTML={{ __html: accentNoFlash }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
