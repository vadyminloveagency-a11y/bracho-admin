"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("director@bracho.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--bg-elevated)",
          border: "1px solid var(--line)",
          padding: "40px 32px 32px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: 42,
            letterSpacing: "0.04em",
            lineHeight: 1,
          }}
        >
          Bracho
        </p>
        <p style={{ margin: "12px 0 28px", color: "var(--muted)", fontSize: 15 }}>
          Director admin — sign in to manage operators and ankety.
        </p>

        <label style={{ display: "block", marginBottom: 14, fontSize: 13, color: "var(--muted)" }}>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: "block", marginBottom: 18, fontSize: 13, color: "var(--muted)" }}>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            style={inputStyle}
          />
        </label>

        {error ? (
          <p style={{ color: "#ff8a80", margin: "0 0 14px", fontSize: 14 }}>{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            border: 0,
            background: "var(--accent)",
            color: "#fff",
            padding: "12px 16px",
            cursor: loading ? "wait" : "pointer",
            fontWeight: 600,
            letterSpacing: "0.03em",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "11px 12px",
  border: "1px solid var(--line)",
  background: "var(--bg-input)",
  color: "var(--text)",
  outline: "none",
};
