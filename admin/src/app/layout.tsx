import type { Metadata } from "next";
import { Varela_Round } from "next/font/google";
import "./globals.css";

const font = Varela_Round({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-varela",
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
      <body
        className={font.variable}
        style={{ fontFamily: 'var(--font-varela), "Varela Round", "Segoe UI", sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
