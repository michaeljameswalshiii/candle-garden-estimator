export type AdminNavSection = "Overview" | "People" | "Website" | "Account";

export type AdminNavItem = {
  href: string;
  label: string;
  detail: string;
  section: AdminNavSection;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Site health", detail: "Visitors and problems", section: "Overview" },
  { href: "/admin/reports", label: "Reports", detail: "Numbers you can print", section: "Overview" },
  { href: "/admin/visitors", label: "Visitors", detail: "Cities and pages", section: "People" },
  { href: "/admin/messages", label: "Messages", detail: "Notes from the contact form", section: "People" },
  { href: "/admin/shop", label: "Shop", detail: "Candle catalog", section: "Website" },
  { href: "/admin/classes", label: "Classes", detail: "Class dates", section: "Website" },
  { href: "/admin/practice", label: "Business info", detail: "Hours, phone, pages", section: "Website" },
  { href: "/admin/photos", label: "Photos", detail: "Hero and story images", section: "Website" },
  { href: "/admin/announcements", label: "Announcements", detail: "News and closed days", section: "Website" },
  { href: "/admin/ai", label: "Content AI", detail: "Rewrite copy", section: "Website" },
  { href: "/admin/social", label: "Social Media", detail: "Draft posts", section: "Website" },
  { href: "/admin/staff", label: "Staff logins", detail: "Add people", section: "Account" },
  { href: "/admin/settings", label: "Settings", detail: "Connections", section: "Account" },
];

export const ADMIN_SECTIONS: AdminNavSection[] = ["Overview", "People", "Website", "Account"];
