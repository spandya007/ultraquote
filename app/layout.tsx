import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@blocknote/mantine/style.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SmartProps",
  description: "Professional proposals for Managed Service Providers",
  icons: {
    // Modern browsers pick the crisp SVG; favicon-32.png is the fallback.
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/icon-192.png",
  },
};

// next-themes mutates <html> (class) and the accent script sets data-accent —
// suppressHydrationWarning avoids the expected first-render mismatch.
const accentNoFlash = `try{var a=localStorage.getItem('smartprops.accent');if(a)document.documentElement.dataset.accent=a;}catch(e){}`;

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
