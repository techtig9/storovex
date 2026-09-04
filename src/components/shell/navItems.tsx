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
];
