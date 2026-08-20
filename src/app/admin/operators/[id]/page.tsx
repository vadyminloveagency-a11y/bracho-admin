"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Anketa = {
  id: string;
  externalId: string;
  displayName: string;
  site: string;
  notes: string | null;
};

type Operator = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  ankety: Anketa[];
};

export default function OperatorDetailPage() {
  const params = useParams<{ id: string }>();
  const [operator, setOperator] = useState<Operator | null>(null);
  const [externalId, setExternalId] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch(`/api/operators/${params.id}`);
    const data = await res.json();
    if (res.ok) setOperator(data.operator);
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function onBind(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/operators/${params.id}/ankety`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        externalId,
        password,
        displayName,
        site: "goldenbride",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setExternalId("");
    setPassword("");
    setDisplayName("");
    await load();
  }

  async function unbind(anketaId: string) {
    await fetch(`/api/ankety/${anketaId}`, { method: "DELETE" });
    await load();
  }

  if (!operator) {
    return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  }

  return (
    <section>
      <Link href="/admin/operators" style={{ color: "var(--muted)", fontSize: 14 }}>
        ← Operators
      </Link>
      <h1
        style={{
          margin: "10px 0 4px",
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize: 34,
          fontWeight: 400,
        }}
      >
        {operator.name}
      </h1>
      <p style={{ margin: "0 0 24px", color: "var(--muted)" }}>{operator.email}</p>

      <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>Привязать анкету (Golden)</h2>
      <form
        onSubmit={onBind}
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "1fr 1.2fr 1.4fr auto",
          background: "var(--bg-elevated)",
          border: "1px solid var(--line)",
          padding: 16,
          marginBottom: 18,
        }}
      >
        <input
          placeholder="ID (логин на Golden)"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          required
          autoComplete="off"
          style={field}
        />
        <input
          placeholder="Пароль анкеты"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          type="password"
          autoComplete="new-password"
          style={field}
        />
        <input
          placeholder="Имя анкеты (Valentina)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          style={field}
        />
        <button
          type="submit"
          style={{
            border: 0,
            background: "var(--accent)",
            color: "#fff",
            padding: "0 16px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Bind
        </button>
      </form>
      {error ? <p style={{ color: "#ff8a80" }}>{error}</p> : null}

      <h2 style={{ fontSize: 18, margin: "24px 0 12px" }}>Привязанные анкеты</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {operator.ankety.map((a) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 14px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--line)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>
                {a.displayName}{" "}
                <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                  ID {a.externalId}
                </span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {a.site} · пароль сохранён
              </div>
            </div>
            <button
              type="button"
              onClick={() => unbind(a.id)}
              style={{
                border: "1px solid var(--line)",
                background: "transparent",
                color: "var(--text)",
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Unbind
            </button>
          </div>
        ))}
        {!operator.ankety.length ? (
          <p style={{ color: "var(--muted)" }}>Пока нет привязанных анкет.</p>
        ) : null}
      </div>
    </section>
  );
}

const field: React.CSSProperties = {
  border: "1px solid var(--line)",
  background: "var(--bg-input)",
  color: "var(--text)",
  padding: "10px 12px",
  outline: "none",
};
