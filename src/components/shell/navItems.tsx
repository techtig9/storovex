import React from "react";

export type NavItem = {id: string; label: string; href: string; icon: React.ReactNode};

const iconProps = {
  viewBox: "0 0 20 20", fill: "none", stroke: "currentColor",
  strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  className: "h-5 w-5 shrink-0",
};

/**
 * Only routes that exist. The spec lists a much larger builder navigation, but
 * showing links to screens the backend does not support is worse than showing fewer.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard", label: "Dashboard", href: "/dashboard",
    icon: <svg {...iconProps}><rect x="2.5" y="2.5" width="6" height="6" rx="1.5" /><rect x="11.5" y="2.5" width="6" height="6" rx="1.5" /><rect x="2.5" y="11.5" width="6" height="6" rx="1.5" /><rect x="11.5" y="11.5" width="6" height="6" rx="1.5" /></svg>,
  },
  {
    id: "generate", label: "Generate", href: "/generate",
    icon: <svg {...iconProps}><path d="M10 2.5 11.8 7l4.7 1.4-3.4 3.4.5 4.7L10 14.4 6.4 16.5l.5-4.7L3.5 8.4 8.2 7z" /></svg>,
  },
  {
    id: "billing", label: "Billing", href: "/billing",
    icon: <svg {...iconProps}><rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="M2.5 8.5h15" /></svg>,
  },
];
