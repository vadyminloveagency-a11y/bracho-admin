"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Operator = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: string;
  _count?: { ankety: number };
};

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/operators");
    const data = await res.json();
    if (res.ok) setOperators(data.operators || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } finally {
      setLoading(false);
    }
  }

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
        Operators
      </h1>
      <p style={{ margin: "0 0 24px", color: "var(--muted)" }}>
        Create operator accounts, then open one to bind ankety.
      </p>

      <form
        onSubmit={onCreate}
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "1.2fr 1.4fr 1fr auto",
          background: "var(--bg-elevated)",
          border: "1px solid var(--line)",
          padding: 16,
          marginBottom: 22,
        }}
      >
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={field}
        />
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={field}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={field}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            border: 0,
            background: "var(--accent)",
            color: "#fff",
            padding: "0 16px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Create
        </button>
      </form>
      {error ? <p style={{ color: "#ff8a80" }}>{error}</p> : null}

      <div style={{ display: "grid", gap: 10 }}>
        {operators.map((op) => (
          <Link
            key={op.id}
            href={`/admin/operators/${op.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 16px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--line)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{op.name}</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>{op.email}</div>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "right" }}>
              <div>{op._count?.ankety ?? 0} ankety</div>
              <div>{op.active ? "active" : "disabled"}</div>
            </div>
          </Link>
        ))}
        {!operators.length ? (
          <p style={{ color: "var(--muted)" }}>No operators yet.</p>
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
