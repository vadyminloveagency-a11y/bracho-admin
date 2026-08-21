"use client";

import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Account = {
  id: string;
  externalId: string;
  displayName: string;
  site: string;
  notes: string | null;
};

type Operator = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  ankety: Account[];
};

type OnlineRow = {
  anketaId: string;
  operatorId: string;
  externalId: string;
  displayName: string;
  lastSeenAt: string;
  operator: { id: string; name: string; email: string };
};

type Snapshot = {
  accounts: Account[];
  operators: Operator[];
  online: OnlineRow[];
  stats: {
    accounts: number;
    operators: number;
    ladiesInWork: number;
    online: number;
  };
};

export default function AccountManagerPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const [opName, setOpName] = useState("");
  const [opEmail, setOpEmail] = useState("");
  const [opPassword, setOpPassword] = useState("");

  const [accName, setAccName] = useState("");
  const [accExternalId, setAccExternalId] = useState("");
  const [accPassword, setAccPassword] = useState("");

  const [showOpForm, setShowOpForm] = useState(false);
  const [showAccForm, setShowAccForm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/account-manager");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      return;
    }
    setError("");
    setData(json);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const onlineIds = useMemo(
    () => new Set((data?.online || []).map((o) => o.anketaId)),
    [data],
  );

  async function createOperator(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: opName,
          email: opEmail,
          password: opPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not create operator");
        return;
      }
      setOpName("");
      setOpEmail("");
      setOpPassword("");
      setShowOpForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: accName,
          externalId: accExternalId,
          password: accPassword,
          operatorId: null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not create questionnaire");
        return;
      }
      setAccName("");
      setAccExternalId("");
      setAccPassword("");
      setShowAccForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function assign(anketaId: string, operatorId: string | null) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/ankety/${anketaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Assign failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
      setDragId(null);
    }
  }

  async function refreshOnline() {
    await load();
  }

  function onDragStart(id: string) {
    setDragId(id);
  }

  function onDropToOperator(operatorId: string) {
    if (!dragId) return;
    assign(dragId, operatorId);
  }

  function onDropToAccounts() {
    if (!dragId) return;
    assign(dragId, null);
  }

  if (!data) {
    return (
      <div style={{ padding: 28, color: "#98a1aa" }}>
        {error || "Loading Account Manager…"}
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255, 43, 58, 0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f8fbff" }}>
            Account Manager
          </h1>
          <p style={{ margin: "4px 0 0", color: "#98a1aa", fontSize: 13 }}>
            Create questionnaires and operators separately, then drag to assign.
          </p>
        </div>
        {error ? (
          <span style={{ color: "#ff6b77", fontSize: 13 }}>{error}</span>
        ) : null}
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(240px, 1fr) minmax(360px, 1.4fr) minmax(240px, 1fr)",
          gap: 0,
        }}
      >
        {/* Accounts */}
        <section
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onDropToAccounts();
          }}
          style={colStyle}
        >
          <div style={colHead}>
            <span>Accounts ({data.stats.accounts})</span>
            <button type="button" style={linkBtn} onClick={() => setShowAccForm((v) => !v)}>
              {showAccForm ? "Cancel" : "+ Add"}
            </button>
          </div>
          {showAccForm ? (
            <form onSubmit={createAccount} style={formBox}>
              <input
                placeholder="Display name"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                required
                style={input}
              />
              <input
                placeholder="Golden ID"
                value={accExternalId}
                onChange={(e) => setAccExternalId(e.target.value)}
                required
                style={input}
              />
              <input
                placeholder="Golden password"
                type="password"
                value={accPassword}
                onChange={(e) => setAccPassword(e.target.value)}
                required
                style={input}
              />
              <button type="submit" disabled={busy} style={primaryBtn}>
                Create questionnaire
              </button>
            </form>
          ) : null}
          <div style={scroll}>
            {data.accounts.length === 0 ? (
              <p style={empty}>No unassigned questionnaires. Create one, or drag here to unassign.</p>
            ) : (
              data.accounts.map((a) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  online={onlineIds.has(a.id)}
                  draggable
                  onDragStart={() => onDragStart(a.id)}
                />
              ))
            )}
          </div>
        </section>

        {/* Operators */}
        <section style={{ ...colStyle, borderLeft: "1px solid rgba(255, 43, 58, 0.2)", borderRight: "1px solid rgba(255, 43, 58, 0.2)" }}>
          <div style={colHead}>
            <span>
              Operators ({data.stats.operators}) · {data.stats.ladiesInWork} ladies in work
            </span>
            <button type="button" style={primaryBtn} onClick={() => setShowOpForm((v) => !v)}>
              {showOpForm ? "Cancel" : "Add Operator"}
            </button>
          </div>
          {showOpForm ? (
            <form onSubmit={createOperator} style={formBox}>
              <input
                placeholder="Name"
                value={opName}
                onChange={(e) => setOpName(e.target.value)}
                required
                style={input}
              />
              <input
                placeholder="Email"
                type="email"
                value={opEmail}
                onChange={(e) => setOpEmail(e.target.value)}
                required
                style={input}
              />
              <input
                placeholder="Password"
                type="password"
                value={opPassword}
                onChange={(e) => setOpPassword(e.target.value)}
                required
                minLength={6}
                style={input}
              />
              <button type="submit" disabled={busy} style={primaryBtn}>
                Create operator
              </button>
            </form>
          ) : null}
          <div style={scroll}>
            {data.operators.map((op) => (
              <div
                key={op.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onDropToOperator(op.id);
                }}
                style={opCard}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{op.name}</div>
                    <div style={{ color: "#98a1aa", fontSize: 12 }}>{op.email}</div>
                  </div>
                  {!op.active ? (
                    <span style={badge}>OFF</span>
                  ) : null}
                </div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {op.ankety.length === 0 ? (
                    <p style={{ ...empty, padding: "10px 0" }}>Drop questionnaire here</p>
                  ) : (
                    op.ankety.map((a) => (
                      <AccountCard
                        key={a.id}
                        account={a}
                        online={onlineIds.has(a.id)}
                        compact
                        draggable
                        onDragStart={() => onDragStart(a.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Online */}
        <section style={colStyle}>
          <div style={colHead}>
            <span>Online ({data.stats.online})</span>
            <button type="button" style={linkBtn} onClick={() => load()}>
              Click to refresh
            </button>
          </div>
          <div style={scroll}>
            {data.online.length === 0 ? (
              <p style={empty}>No questionnaires online. Opens when an operator logs into one in Bracho.</p>
            ) : (
              data.online.map((row) => (
                <div key={row.anketaId} style={onlineCard}>
                  <span style={dot} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{row.displayName}</div>
                    <div style={{ color: "#98a1aa", fontSize: 12 }}>
                      ID {row.externalId} · {row.operator.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    title="Refresh"
                    style={iconBtn}
                    onClick={() => refreshOnline()}
                  >
                    ⏻
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function AccountCard({
  account,
  online,
  compact,
  draggable,
  onDragStart,
}: {
  account: Account;
  online?: boolean;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      style={{
        ...accountCard,
        padding: compact ? "8px 10px" : "10px 12px",
        cursor: draggable ? "grab" : "default",
      }}
    >
      {online ? <span style={dot} /> : <span style={{ width: 8 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
          {account.displayName}
        </div>
        <div style={{ color: "#98a1aa", fontSize: 12 }}>ID {account.externalId}</div>
      </div>
    </div>
  );
}

const colStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  background: "#141210",
};

const colHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "12px 14px",
  borderBottom: "1px solid rgba(255, 43, 58, 0.22)",
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: "#ff6b77",
};

const scroll: CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const formBox: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 12,
  borderBottom: "1px solid rgba(255, 43, 58, 0.18)",
};

const input: CSSProperties = {
  height: 34,
  borderRadius: 8,
  border: "1px solid rgba(255, 43, 58, 0.35)",
  background: "#0d0a0b",
  color: "#f8fbff",
  padding: "0 10px",
  outline: "none",
};

const primaryBtn: CSSProperties = {
  height: 34,
  borderRadius: 8,
  border: "1px solid rgba(255, 43, 58, 0.75)",
  background: "rgba(255, 43, 58, 0.18)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  padding: "0 12px",
};

const linkBtn: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#86efac",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 12,
  textTransform: "none",
  letterSpacing: 0,
};

const accountCard: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 10,
  border: "1px solid rgba(255, 43, 58, 0.35)",
  background: "#0d0a0b",
};

const opCard: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255, 43, 58, 0.35)",
  background: "#0d0a0b",
  padding: 12,
};

const onlineCard: CSSProperties = {
  ...accountCard,
  padding: "10px 12px",
};

const empty: CSSProperties = {
  margin: 0,
  color: "#98a1aa",
  fontSize: 13,
  textAlign: "center",
};

const badge: CSSProperties = {
  alignSelf: "flex-start",
  fontSize: 10,
  fontWeight: 800,
  color: "#ff6b77",
  border: "1px solid rgba(255, 43, 58, 0.55)",
  borderRadius: 6,
  padding: "2px 6px",
};

const dot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#4ade80",
  flex: "0 0 auto",
};

const iconBtn: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid rgba(255, 43, 58, 0.45)",
  background: "transparent",
  color: "#ff6b77",
  cursor: "pointer",
};
