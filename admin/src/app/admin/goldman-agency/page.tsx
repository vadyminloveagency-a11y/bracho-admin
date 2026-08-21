"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import "./goldman-agency.css";

type ManItem = {
  id: string;
  externalId: string;
  createdAt: string;
  updatedAt: string;
};

type ModalMode = "add" | "edit" | null;

export default function GoldmanAgencyPage() {
  const [items, setItems] = useState<ManItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalMode>(null);
  const [draftId, setDraftId] = useState("");

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

  function openAdd() {
    setDraftId("");
    setError("");
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
    setDraftId(row.externalId);
    setError("");
    setModal("edit");
  }

  function closeModal() {
    setModal(null);
    setDraftId("");
  }

  async function submitModal(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (modal === "add") {
        const res = await fetch("/api/goldman-agency", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ externalId: draftId }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Не удалось добавить");
          return;
        }
        setItems((prev) => [json.item, ...prev]);
        setSelectedId(json.item.id);
        closeModal();
        return;
      }

      if (modal === "edit" && selectedId) {
        const res = await fetch(`/api/goldman-agency/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ externalId: draftId }),
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
      {error && !modal ? <div className="ga-banner-error">{error}</div> : null}

      <div className="ga-card">
        <header className="ga-card-head">Goldman Agency</header>

        <div className="ga-list" role="listbox" aria-label="Список ID мужчин">
          {items.length === 0 ? (
            <p className="ga-empty">Список пуст. Нажмите + чтобы добавить ID.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selectedId === item.id}
                className={`ga-row${selectedId === item.id ? " is-selected" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                {item.externalId}
              </button>
            ))
          )}
        </div>

        <div className="ga-actions">
          <button
            type="button"
            className="ga-btn ga-btn-add"
            title="Добавить"
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
            className="ga-btn ga-btn-send"
            title="Скоро"
            disabled
            aria-disabled="true"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" />
            </svg>
          </button>
        </div>
      </div>

      {modal ? (
        <div className="ga-modal-backdrop" onClick={closeModal}>
          <form
            className="ga-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitModal}
          >
            <h2 className="ga-modal-title">Введите ID</h2>
            <input
              className="ga-modal-input"
              value={draftId}
              onChange={(e) => setDraftId(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoFocus
              placeholder=""
              disabled={busy}
            />
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
              <button type="submit" className="ga-modal-ok" disabled={busy || !draftId}>
                OK
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
