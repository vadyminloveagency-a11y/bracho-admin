import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

const NAV = [
  { href: "/admin/account-manager", label: "Account Manager" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session || session.role !== "DIRECTOR") redirect("/login");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        background: "#141210",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid rgba(255, 43, 58, 0.28)",
          background: "#0d0a0b",
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div>
          <Link
            href="/admin/account-manager"
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: 26,
              letterSpacing: "0.04em",
              color: "#f8fbff",
            }}
          >
            Bracho
          </Link>
          <p style={{ margin: "6px 0 0", color: "#98a1aa", fontSize: 12 }}>
            Director
          </p>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255, 43, 58, 0.45)",
                background: "rgba(255, 43, 58, 0.12)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ color: "#98a1aa", fontSize: 13 }}>{session.name}</span>
          <LogoutButton />
        </div>
      </aside>

      <div style={{ minWidth: 0, minHeight: "100vh" }}>{children}</div>
    </div>
  );
}
