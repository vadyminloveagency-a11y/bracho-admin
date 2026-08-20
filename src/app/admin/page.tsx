import Link from "next/link";
import { prisma } from "@/lib/db";
import { ensureDirector } from "@/lib/seed";

export default async function AdminHomePage() {
  await ensureDirector();
  const [operators, ankety] = await Promise.all([
    prisma.user.count({ where: { role: "OPERATOR" } }),
    prisma.anketa.count(),
  ]);

  return (
    <section>
      <h1
        style={{
          margin: "0 0 8px",
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize: 34,
          fontWeight: 400,
        }}
      >
        Director panel
      </h1>
      <p style={{ margin: "0 0 28px", color: "var(--muted)" }}>
        Create operators and bind Golden Bride ankety to them.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        <Stat label="Operators" value={String(operators)} />
        <Stat label="Bound ankety" value={String(ankety)} />
      </div>

      <Link
        href="/admin/operators"
        style={{
          display: "inline-block",
          background: "var(--accent)",
          color: "#fff",
          padding: "12px 18px",
          fontWeight: 600,
        }}
      >
        Manage operators
      </Link>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--line)",
        padding: "18px 16px",
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 13 }}>{label}</div>
      <div
        style={{
          marginTop: 6,
          fontSize: 32,
          fontFamily: "var(--font-display), Georgia, serif",
        }}
      >
        {value}
      </div>
    </div>
  );
}
