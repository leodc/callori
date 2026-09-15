import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Callori — Your calling companion",
  description:
    "A little help with everyday phone calls. Follow the conversation, make the decisions, and let Callori do the talking.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
