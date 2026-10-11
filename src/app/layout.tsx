import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://raghavbaghla.com"),
  title: {
    default: "Raghav Baghla — Words, ideas & creative work",
    template: "%s | Raghav Baghla",
  },
  description:
    "A creative portfolio of copy, social posts, campaign concepts, and fresh perspectives by Raghav Baghla.",
  openGraph: { type: "website", siteName: "Raghav Baghla", locale: "en_IN" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
