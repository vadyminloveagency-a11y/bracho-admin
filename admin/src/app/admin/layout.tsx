import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session || session.role !== "DIRECTOR") redirect("/login");

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "18px 28px",
          borderBottom: "1px solid var(--line)",
          background: "rgba(28,28,28,0.92)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <Link
            href="/admin"
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: 28,
              letterSpacing: "0.04em",
            }}
          >
            Bracho
          </Link>
          <nav style={{ display: "flex", gap: 14, fontSize: 14, color: "var(--muted)" }}>
            <Link href="/admin">Overview</Link>
            <Link href="/admin/operators">Operators</Link>
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 14 }}>
          <span style={{ color: "var(--muted)" }}>{session.name}</span>
          <LogoutButton />
        </div>
      </header>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 48px" }}>
        {children}
      </div>
    </div>
  );
}
