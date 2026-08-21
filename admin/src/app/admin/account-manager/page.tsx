"use client";

import {
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import "./account-manager.css";

type Account = {
  id: string;
  externalId: string;
  displayName: string;
  avatarUrl?: string | null;
  site: string;
  notes: string | null;
};

type Operator = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  globalSyncLogin?: string;
  hasGlobalSyncPassword?: boolean;
  ankety: Account[];
};

type OnlineRow = {
  anketaId: string;
  operatorId: string;
  externalId: string;
  displayName: string;
  avatarUrl?: string | null;
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

type ModalKind = "account" | "account-edit" | "operator-create" | "operator-edit" | null;

function initials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12a7 7 0 1 1-14 0c0-2.04.88-3.87 2.28-5.17L5.87 5.17A8.96 8.96 0 0 0 3 12a9 9 0 1 0 18 0c0-2.61-1.12-4.96-2.9-6.6l-.27-.23z" />
    </svg>
  );
}

function Avatar({
  name,
  src,
  online,
  loading,
  onClick,
}: {
  name: string;
  src?: string | null;
  online?: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const showImg = Boolean(src) && !broken;
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      className={`am-avatar-wrap${clickable ? " is-clickable" : ""}${
        loading ? " is-loading" : ""
      }`}
      title={
        clickable
          ? loading
            ? "Fetching photo…"
            : "Click to fetch / refresh photo from Golden"
          : undefined
      }
      disabled={!clickable || loading}
      draggable={false}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!clickable || loading) return;
        onClick?.();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="account-avatar"
          src={src!}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="account-avatar placeholder" aria-hidden="true">
          {loading ? "…" : initials(name)}
        </span>
      )}
      {online ? <span className="am-online-dot" /> : null}
    </button>
  );
}

export default function AccountManagerPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [editOp, setEditOp] = useState<Operator | null>(null);
  const [editAcc, setEditAcc] = useState<Account | null>(null);

  const [opName, setOpName] = useState("");
  const [opEmail, setOpEmail] = useState("");
  const [opPassword, setOpPassword] = useState("");
  const [opGsLogin, setOpGsLogin] = useState("");
  const [opGsPassword, setOpGsPassword] = useState("");

  const [accName, setAccName] = useState("");
  const [accExternalId, setAccExternalId] = useState("");
  const [accPassword, setAccPassword] = useState("");
  const [avatarBusyId, setAvatarBusyId] = useState<string | null>(null);
  const [avatarMsg, setAvatarMsg] = useState("");

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

  function closeModal() {
    setModal(null);
    setEditOp(null);
    setEditAcc(null);
    setOpName("");
    setOpEmail("");
    setOpPassword("");
    setAccName("");
    setAccExternalId("");
    setAccPassword("");
  }

  function openCreateAccount() {
    setEditAcc(null);
    setAccName("");
    setAccExternalId("");
    setAccPassword("");
    setModal("account");
  }

  function openEditAccount(acc: Account) {
    setEditAcc(acc);
    setAccName(acc.displayName);
    setAccExternalId(acc.externalId);
    setAccPassword("");
    setModal("account-edit");
  }

  function openCreateOperator() {
    setOpName("");
    setOpEmail("");
    setOpPassword("");
    setOpGsLogin("");
    setOpGsPassword("");
    setModal("operator-create");
  }

  function openEditOperator(op: Operator) {
    setEditOp(op);
    setOpName(op.name);
    setOpEmail(op.email);
    setOpPassword("");
    setOpGsLogin(op.globalSyncLogin || "");
    setOpGsPassword("");
    setModal("operator-edit");
  }

  async function createOperator(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, string> = {
        name: opName,
        email: opEmail,
        password: opPassword,
      };
      if (opGsLogin.trim()) body.globalSyncLogin = opGsLogin.trim();
      if (opGsPassword.trim()) body.globalSyncPassword = opGsPassword.trim();

      const res = await fetch("/api/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not create operator");
        return;
      }
      closeModal();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveOperator(e: FormEvent) {
    e.preventDefault();
    if (!editOp) return;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, string> = {
        name: opName,
        email: opEmail,
        globalSyncLogin: opGsLogin.trim(),
      };
      if (opPassword.trim()) body.password = opPassword.trim();
      if (opGsPassword.trim()) body.globalSyncPassword = opGsPassword.trim();

      const res = await fetch(`/api/operators/${editOp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not update operator");
        return;
      }
      closeModal();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteOperator() {
    if (!editOp) return;
    if (!window.confirm(`Delete operator ${editOp.name}? Questionnaires will be unassigned.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/operators/${editOp.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not delete operator");
        return;
      }
      closeModal();
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
      closeModal();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    if (!editAcc) return;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, string> = {
        displayName: accName,
        externalId: accExternalId,
      };
      if (accPassword.trim()) body.password = accPassword.trim();

      const res = await fetch(`/api/ankety/${editAcc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not update lady");
        return;
      }
      closeModal();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!editAcc) return;
    if (!window.confirm(`Delete lady ${editAcc.displayName}?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/ankety/${editAcc.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not delete lady");
        return;
      }
      closeModal();
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
      setDropTarget(null);
    }
  }

  async function forceOffline(anketaId: string) {
    setBusy(true);
    try {
      await fetch(`/api/presence?anketaId=${encodeURIComponent(anketaId)}`, {
        method: "DELETE",
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function refreshAvatar(anketaId: string) {
    if (avatarBusyId) return;
    setAvatarBusyId(anketaId);
    setError("");
    setAvatarMsg("Fetching photo from Golden…");
    try {
      const res = await fetch(`/api/ankety/${anketaId}/avatar`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error || "Could not fetch photo";
        setError(msg);
        setAvatarMsg("");
        return;
      }
      const url = json.anketa?.avatarUrl as string | undefined;
      if (!url) {
        setError("Golden returned no photo URL");
        setAvatarMsg("");
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          accounts: prev.accounts.map((a) =>
            a.id === anketaId ? { ...a, avatarUrl: url } : a,
          ),
          operators: prev.operators.map((op) => ({
            ...op,
            ankety: op.ankety.map((a) =>
              a.id === anketaId ? { ...a, avatarUrl: url } : a,
            ),
          })),
          online: prev.online.map((row) =>
            row.anketaId === anketaId ? { ...row, avatarUrl: url } : row,
          ),
        };
      });
      setAvatarMsg("Photo updated");
      window.setTimeout(() => setAvatarMsg(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch photo");
      setAvatarMsg("");
    } finally {
      setAvatarBusyId(null);
    }
  }

  function onDragStart(id: string) {
    setDragId(id);
  }

  function beginCardDrag(e: DragEvent, id: string) {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select")) {
      e.preventDefault();
      return;
    }
    onDragStart(id);
  }

  function onDragEnd() {
    setDragId(null);
    setDropTarget(null);
  }

  if (!data) {
    return (
      <section className="admin-section">
        <div className="empty-state">{error || "Loading Account Manager…"}</div>
      </section>
    );
  }

  return (
    <section className="admin-section">
      {error && !modal ? <div className="status-error">{error}</div> : null}
      {avatarMsg && !modal ? <div className="status-ok">{avatarMsg}</div> : null}

      <div className="am-board">
        <div
          className={`am-col${dropTarget === "accounts" ? " is-drop-target" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget("accounts");
          }}
          onDragLeave={() => setDropTarget((t) => (t === "accounts" ? null : t))}
          onDrop={(e) => {
            e.preventDefault();
            if (dragId) assign(dragId, null);
          }}
        >
          <div className="am-col-head">
            <h3>
              Accounts <span className="count">({data.stats.accounts})</span>
            </h3>
            <button type="button" className="btn-primary" onClick={openCreateAccount}>
              Add Account
            </button>
          </div>
          <div className="am-col-body">
            {data.accounts.length === 0 ? (
              <p className="empty-state">
                No unassigned questionnaires. Create one, or drag here to unassign.
              </p>
            ) : (
              data.accounts.map((a) => (
                <div
                  key={a.id}
                  className={`account-card${onlineIds.has(a.id) ? " is-online" : ""}${
                    dragId === a.id ? " is-dragging" : ""
                  }`}
                  draggable
                  onDragStart={(e) => beginCardDrag(e, a.id)}
                  onDragEnd={onDragEnd}
                >
                  <Avatar
                    name={a.displayName}
                    src={a.avatarUrl}
                    online={onlineIds.has(a.id)}
                    loading={avatarBusyId === a.id}
                    onClick={() => refreshAvatar(a.id)}
                  />
                  <div className="account-meta">
                    <p className="account-name">{a.displayName}</p>
                    <p className="account-sub">ID {a.externalId}</p>
                  </div>
                  <button
                    type="button"
                    className="account-edit-btn"
                    title="Edit lady"
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditAccount(a);
                    }}
                  >
                    <PencilIcon />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="am-col">
          <div className="am-col-head">
            <h3>
              Operators <span className="count">({data.stats.operators})</span>
            </h3>
            <span className="am-in-work">{data.stats.ladiesInWork} ladies in work</span>
            <button type="button" className="btn-primary" onClick={openCreateOperator}>
              Add Operator
            </button>
          </div>
          <div className="am-col-body am-operators-body">
            {data.operators.length === 0 ? (
              <p className="empty-state">No operators yet</p>
            ) : (
              <div className="operators-grid">
                {data.operators.map((op) => (
                  <div
                    key={op.id}
                    className={`operator-card${!op.active ? " is-banned" : ""}${
                      dropTarget === op.id ? " is-drop-target" : ""
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropTarget(op.id);
                    }}
                    onDragLeave={() =>
                      setDropTarget((t) => (t === op.id ? null : t))
                    }
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId) assign(dragId, op.id);
                    }}
                  >
                    <div className="operator-card-head">
                      <div className="operator-meta">
                        <p className="operator-name">
                          {op.name}
                          {!op.active ? (
                            <span className="operator-ban-badge">BAN</span>
                          ) : null}
                        </p>
                        <p className="operator-login">{op.email}</p>
                      </div>
                      <button
                        type="button"
                        className="account-edit-btn"
                        title="Edit operator"
                        onClick={() => openEditOperator(op)}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    <div
                      className={`operator-body${op.ankety.length === 0 ? " is-empty" : ""}`}
                    >
                      {op.ankety.length === 0 ? (
                        "No linked accounts"
                      ) : (
                        op.ankety.map((a) => (
                          <div
                            key={a.id}
                            className={`linked-account${
                              onlineIds.has(a.id) ? " is-online" : ""
                            }${dragId === a.id ? " is-dragging" : ""}`}
                            draggable
                            onDragStart={(e) => beginCardDrag(e, a.id)}
                            onDragEnd={onDragEnd}
                          >
                            <Avatar
                              name={a.displayName}
                              src={a.avatarUrl}
                              online={onlineIds.has(a.id)}
                              loading={avatarBusyId === a.id}
                              onClick={() => refreshAvatar(a.id)}
                            />
                            <div className="account-meta">
                              <p className="account-name">{a.displayName}</p>
                              <p className="account-sub">ID {a.externalId}</p>
                            </div>
                            <button
                              type="button"
                              className="linked-edit"
                              title="Edit lady"
                              draggable={false}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditAccount(a);
                              }}
                            >
                              <PencilIcon />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="am-col am-online-col">
          <div
            className="am-col-head"
            onClick={() => load()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") load();
            }}
          >
            <h3>
              Online <span className="count">({data.stats.online})</span>
            </h3>
            <span className="am-online-hint">Click to refresh</span>
          </div>
          <div className="am-col-body">
            {data.online.length === 0 ? (
              <p className="empty-state">
                No questionnaires online. Opens when an operator logs into one in
                Bracho.
              </p>
            ) : (
              <div className="am-online-list">
                {data.online.map((row) => (
                  <div key={row.anketaId} className="am-online-row">
                    <Avatar
                      name={row.displayName}
                      src={row.avatarUrl}
                      online
                      loading={avatarBusyId === row.anketaId}
                      onClick={() => refreshAvatar(row.anketaId)}
                    />
                    <div className="account-meta">
                      <p className="account-name">{row.displayName}</p>
                      <p className="account-sub">
                        ID {row.externalId} · {row.operator.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="account-power-btn"
                      title="Force offline"
                      disabled={busy}
                      onClick={() => forceOffline(row.anketaId)}
                    >
                      <PowerIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {modal === "account" ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <form className="modal-card create-modal" onSubmit={createAccount}>
            <div className="create-modal-head">
              <h3 className="modal-title">Create Account</h3>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={closeModal}
              >
                ×
              </button>
            </div>
            {error ? <div className="status-error">{error}</div> : null}
            <div className="form-grid">
              <input
                placeholder="Lady name"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                required
                autoFocus
              />
              <input
                placeholder="Golden ID"
                value={accExternalId}
                onChange={(e) => setAccExternalId(e.target.value)}
                required
              />
              <input
                placeholder="Golden password"
                type="password"
                value={accPassword}
                onChange={(e) => setAccPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-submit" disabled={busy}>
              Submit
            </button>
          </form>
        </div>
      ) : null}

      {modal === "account-edit" && editAcc ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <form className="modal-card create-modal" onSubmit={saveAccount}>
            <div className="create-modal-head">
              <h3 className="modal-title">Edit Lady</h3>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={closeModal}
              >
                ×
              </button>
            </div>
            {error ? <div className="status-error">{error}</div> : null}
            <p className="modal-hint">Leave password empty to keep the current one.</p>
            <div className="form-grid">
              <input
                placeholder="Lady name"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                required
                autoFocus
              />
              <input
                placeholder="Golden ID"
                value={accExternalId}
                onChange={(e) => setAccExternalId(e.target.value)}
                required
              />
              <input
                placeholder="New Golden password (optional)"
                type="password"
                value={accPassword}
                onChange={(e) => setAccPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-submit" disabled={busy}>
              Save
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={deleteAccount}
            >
              Delete lady
            </button>
          </form>
        </div>
      ) : null}

      {modal === "operator-create" ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <form className="modal-card create-modal" onSubmit={createOperator}>
            <div className="create-modal-head">
              <h3 className="modal-title">Create Operator</h3>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={closeModal}
              >
                ×
              </button>
            </div>
            {error ? <div className="status-error">{error}</div> : null}
            <div className="form-grid">
              <input
                placeholder="Name"
                value={opName}
                onChange={(e) => setOpName(e.target.value)}
                required
                autoFocus
              />
              <input
                placeholder="Login (email)"
                type="email"
                value={opEmail}
                onChange={(e) => setOpEmail(e.target.value)}
                required
              />
              <input
                placeholder="Password"
                type="password"
                value={opPassword}
                onChange={(e) => setOpPassword(e.target.value)}
                required
                minLength={6}
              />
              <input
                placeholder="Global Sync login (optional)"
                value={opGsLogin}
                onChange={(e) => setOpGsLogin(e.target.value)}
                autoComplete="off"
              />
              <input
                placeholder="Global Sync password (optional)"
                type="password"
                value={opGsPassword}
                onChange={(e) => setOpGsPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="btn-submit" disabled={busy}>
              Submit
            </button>
          </form>
        </div>
      ) : null}

      {modal === "operator-edit" && editOp ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <form className="modal-card create-modal" onSubmit={saveOperator}>
            <div className="create-modal-head">
              <h3 className="modal-title">Edit Operator</h3>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={closeModal}
              >
                ×
              </button>
            </div>
            {error ? <div className="status-error">{error}</div> : null}
            <p className="modal-hint">
              Leave Bracho / Global Sync passwords empty to keep the current ones.
              {editOp.hasGlobalSyncPassword ? " Global Sync password is set." : ""}
            </p>
            <div className="form-grid">
              <input
                placeholder="Name"
                value={opName}
                onChange={(e) => setOpName(e.target.value)}
                required
                autoFocus
              />
              <input
                placeholder="Login (email)"
                type="email"
                value={opEmail}
                onChange={(e) => setOpEmail(e.target.value)}
                required
              />
              <input
                placeholder="New Bracho password (optional)"
                type="password"
                value={opPassword}
                onChange={(e) => setOpPassword(e.target.value)}
                minLength={6}
              />
              <input
                placeholder="Global Sync login"
                value={opGsLogin}
                onChange={(e) => setOpGsLogin(e.target.value)}
                autoComplete="off"
              />
              <input
                placeholder="New Global Sync password (optional)"
                type="password"
                value={opGsPassword}
                onChange={(e) => setOpGsPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="btn-submit" disabled={busy}>
              Save
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={deleteOperator}
            >
              Delete operator
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
