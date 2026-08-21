import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { AdminSidebarNav } from "@/components/AdminSidebarNav";
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
        <AdminSidebarNav />

        <LogoutButton />
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
