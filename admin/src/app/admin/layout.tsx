import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import "./account-manager/account-manager.css";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session || session.role !== "DIRECTOR") redirect("/login");

  return (
    <div className="panel-layout">
      <div className="admin-sidebar-spacer" aria-hidden="true" />
      <aside className="admin-sidebar">
        <div className="sidebar-top">
          <p className="sidebar-brand">Bracho</p>
          <p className="sidebar-user">{session.name}</p>
        </div>

        <div className="sidebar-section-title">Manage</div>
        <nav className="sidebar-nav">
          <Link
            href="/admin/account-manager"
            className="sidebar-nav-btn is-active"
            aria-label="Account Manager"
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="7" height="7" rx="1.5" />
                <rect x="14" y="4" width="7" height="7" rx="1.5" />
                <rect x="3" y="13" width="7" height="7" rx="1.5" />
                <rect x="14" y="13" width="7" height="7" rx="1.5" />
              </svg>
            </span>
            <span className="sidebar-nav-label">Account Manager</span>
          </Link>
        </nav>

        <LogoutButton />
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
