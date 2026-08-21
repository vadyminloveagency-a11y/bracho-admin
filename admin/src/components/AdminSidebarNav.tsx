"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminSidebarNav() {
  const pathname = usePathname() || "";

  return (
    <nav className="sidebar-nav">
      <Link
        href="/admin/account-manager"
        className={`sidebar-nav-btn${
          pathname.startsWith("/admin/account-manager") ? " is-active" : ""
        }`}
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

      <Link
        href="/admin/goldman-agency"
        className={`sidebar-nav-btn${
          pathname.startsWith("/admin/goldman-agency") ? " is-active" : ""
        }`}
        aria-label="Goldman Agency"
      >
        <span className="sidebar-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M8 6h13" />
            <path d="M8 12h13" />
            <path d="M8 18h13" />
            <path d="M3 6h.01" />
            <path d="M3 12h.01" />
            <path d="M3 18h.01" />
          </svg>
        </span>
        <span className="sidebar-nav-label">Goldman Agency</span>
      </Link>
    </nav>
  );
}
