"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      style={{
        border: "1px solid var(--line)",
        background: "transparent",
        color: "var(--text)",
        padding: "6px 12px",
        cursor: "pointer",
      }}
    >
      Log out
    </button>
  );
}
