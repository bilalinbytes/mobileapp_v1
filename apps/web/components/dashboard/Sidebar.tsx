"use client";

import { Users } from "lucide-react";
import styles from "./Sidebar.module.css";

type View = "dashboard" | "create" | "export";

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

const NAV_ITEMS: { id: View; icon: React.ElementType; label: string }[] = [
  { id: "dashboard",  icon: Users,     label: "Patients"  },
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.navItem} ${activeView === item.id ? styles.navItemActive : ""}`}
              title={item.label}
              onClick={() => onViewChange(item.id)}
            >
              <div className={styles.iconWrap}>
                <Icon size={18} strokeWidth={1.6} />
              </div>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>

    </aside>
  );
}
