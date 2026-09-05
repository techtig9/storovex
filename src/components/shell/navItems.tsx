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
    id: "products", label: "Products", href: "/products",
    icon: <svg {...iconProps}><path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z" /><path d="M3 6.5 10 10l7-3.5M10 10v7" /></svg>,
  },
  {
    id: "orders", label: "Orders", href: "/orders",
    icon: <svg {...iconProps}><path d="M4 3h9l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M6.5 9h7M6.5 12.5h7" /></svg>,
  },
  {
    id: "discounts", label: "Discounts", href: "/discounts",
    icon: <svg {...iconProps}><path d="M10.5 2.5H16a1.5 1.5 0 0 1 1.5 1.5v5.5a1 1 0 0 1-.3.7l-7 7a1 1 0 0 1-1.4 0l-5.5-5.5a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 .7-.3z" /><circle cx="13.5" cy="6.5" r="1" /></svg>,
  },
  {
    id: "collections", label: "Collections", href: "/collections",
    icon: <svg {...iconProps}><rect x="2.5" y="4" width="15" height="4" rx="1" /><rect x="2.5" y="11" width="15" height="4" rx="1" /></svg>,
  },
  {
    id: "team", label: "Team", href: "/team",
    icon: <svg {...iconProps}><circle cx="7.5" cy="7" r="2.5" /><path d="M2.5 16c0-2.5 2.2-4 5-4s5 1.5 5 4" /><path d="M13 5.2a2.5 2.5 0 0 1 0 4.6M14.5 16c0-2-.7-3.3-2-4.2" /></svg>,
  },
  {
    id: "settings", label: "Settings", href: "/settings",
    icon: <svg {...iconProps}><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" /></svg>,
  },
];
