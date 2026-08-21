"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import "./goldman-agency.css";

type ManItem = {
  id: string;
  externalId: string;
  isNew?: boolean;
  createdAt: string;
  updatedAt: string;
};

type ModalMode = "add" | "edit" | "export" | null;

function parseIdsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const id = part.replace(/\D/g, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export default function GoldmanAgencyPage() {
  const [items, setItems] = useState<ManItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [modal, setModal] = useState<ModalMode>(null);
  const [draftText, setDraftText] = useState("");
  const [copied, setCopied] = useState(false);

  const exportText = useMemo(
    () => items.map((i) => i.externalId).join("\n"),
    [items],
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/goldman-agency");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Не удалось загрузить список");
      return;
    }
    setError("");
    setItems(json.items || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Pick up IDs auto-collected by operators' Home toasts.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      load();
    };
    const t = window.setInterval(tick, 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  function openAdd() {
    setDraftText("");
    setError("");
    setOkMsg("");
    setModal("add");
  }

  function openEdit() {
    if (!selectedId) {
      setError("Выберите ID в списке");
      return;
    }
    const row = items.find((i) => i.id === selectedId);
    if (!row) {
      setError("Выберите ID в списке");
      return;
    }
    setDraftText(row.externalId);
    setError("");
    setOkMsg("");
    setModal("edit");
  }

  function openExport() {
    setCopied(false);
    setError("");
    setOkMsg("");
    setDraftText(exportText);
    setModal("export");
  }

  function closeModal() {
    setModal(null);
    setDraftText("");
    setCopied(false);
  }

  async function copyExport() {
    const text = exportText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Не удалось скопировать");
    }
  }

  async function submitModal(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      if (modal === "add") {
        const ids = parseIdsFromText(draftText);
        if (!ids.length) {
          setError("Вставьте один или несколько ID");
          return;
        }
        const res = await fetch("/api/goldman-agency", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Не удалось добавить");
          return;
        }
        await load();
        setOkMsg(
          `Добавлено: ${json.added ?? ids.length}${
            json.skipped ? `, уже были: ${json.skipped}` : ""
          }`,
        );
        closeModal();
        return;
      }

      if (modal === "edit" && selectedId) {
        const id = parseIdsFromText(draftText)[0];
        if (!id) {
          setError("Введите ID");
          return;
        }
        const res = await fetch(`/api/goldman-agency/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ externalId: id }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Не удалось сохранить");
          return;
        }
        setItems((prev) =>
          prev.map((i) => (i.id === selectedId ? json.item : i)),
        );
        closeModal();
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selectedId) {
      setError("Выберите ID в списке");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/goldman-agency/${selectedId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Не удалось удалить");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== selectedId));
      setSelectedId(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ga-page">
      <div className="ga-panel">
        <div className="ga-panel-head">
          <h2>
            Goldman Agency{" "}
            <span className="ga-count">({items.length})</span>
          </h2>
          <p className="ga-sub">
            Список мужских ID. Оранжевые — новые с Home (монета / replenished).
            Клик снимает подсветку.
          </p>
        </div>

        {error && !modal ? <div className="ga-banner-error">{error}</div> : null}
        {okMsg && !modal ? <div className="ga-banner-ok">{okMsg}</div> : null}

        <div className="ga-toolbar">
          <button
            type="button"
            className="ga-btn ga-btn-add"
            title="Добавить ID"
            disabled={busy}
            onClick={openAdd}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
          <button
            type="button"
            className="ga-btn ga-btn-del"
            title="Удалить"
            disabled={busy || !selectedId}
            onClick={removeSelected}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
          <button
            type="button"
            className="ga-btn ga-btn-edit"
            title="Редактировать"
            disabled={busy || !selectedId}
            onClick={openEdit}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </button>
          <button
            type="button"
            className="ga-btn ga-btn-export"
            title="Все ID — посмотреть / копировать"
            disabled={busy}
            onClick={openExport}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" />
            </svg>
          </button>
        </div>

        <div className="ga-list" role="listbox" aria-label="Список ID мужчин">
          {items.length === 0 ? (
            <p className="ga-empty">
              Список пуст. Нажмите + и вставьте ID столбиком.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selectedId === item.id}
                className={`ga-row${selectedId === item.id ? " is-selected" : ""}${
                  item.isNew ? " is-new" : ""
                }`}
                onClick={() => {
                  setSelectedId(item.id);
                  if (item.isNew) {
                    setItems((prev) =>
                      prev.map((row) =>
                        row.id === item.id ? { ...row, isNew: false } : row,
                      ),
                    );
                    fetch(`/api/goldman-agency/${item.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isNew: false }),
                    }).catch(() => {});
                  }
                }}
              >
                {item.externalId}
              </button>
            ))
          )}
        </div>
      </div>

      {modal === "add" || modal === "edit" ? (
        <div className="ga-modal-backdrop" onClick={closeModal}>
          <form
            className="ga-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitModal}
          >
            <h2 className="ga-modal-title">
              {modal === "add" ? "Введите ID" : "Изменить ID"}
            </h2>
            {modal === "add" ? (
              <>
                <p className="ga-modal-hint">
                  Один ID или много — каждый с новой строки (можно вставить
                  столбец из Excel).
                </p>
                <textarea
                  className="ga-modal-textarea"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  autoFocus
                  rows={10}
                  placeholder={"637048\n680186\n680200"}
                  disabled={busy}
                />
              </>
            ) : (
              <input
                className="ga-modal-input"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoFocus
                disabled={busy}
              />
            )}
            {error ? <p className="ga-modal-error">{error}</p> : null}
            <div className="ga-modal-actions">
              <button
                type="button"
                className="ga-modal-cancel"
                disabled={busy}
                onClick={closeModal}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="ga-modal-ok"
                disabled={busy || !draftText.trim()}
              >
                OK
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modal === "export" ? (
        <div className="ga-modal-backdrop" onClick={closeModal}>
          <div
            className="ga-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2 className="ga-modal-title">Все ID ({items.length})</h2>
            <p className="ga-modal-hint">Можно скопировать весь список.</p>
            <textarea
              className="ga-modal-textarea"
              value={exportText}
              readOnly
              rows={12}
            />
            <div className="ga-modal-actions">
              <button
                type="button"
                className="ga-modal-cancel"
                onClick={closeModal}
              >
                Закрыть
              </button>
              <button
                type="button"
                className="ga-modal-ok"
                disabled={!items.length}
                onClick={copyExport}
              >
                {copied ? "Скопировано" : "Копировать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
