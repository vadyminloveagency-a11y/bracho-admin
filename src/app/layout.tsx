import type { Metadata } from "next";
import { Libre_Baskerville, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const display = Libre_Baskerville({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
});

const body = Source_Sans_3({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Bracho",
  description: "Bracho director admin panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <div style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
