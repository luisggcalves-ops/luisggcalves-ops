/**
 * Navigation for both shells. Sections that haven't shipped yet are shown as
 * "Soon" and are not clickable. There are no dead links.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: "overview" | "calendar" | "customers" | "staff" | "finance" | "inventory" | "reports" | "settings" | "today" | "earnings" | "profile";
  available: boolean;
  exact?: boolean;
};

export const OWNER_NAV: NavItem[] = [
  { label: "Overview", href: "/app", icon: "overview", available: true, exact: true },
  { label: "Appointments", href: "/app/appointments", icon: "calendar", available: true },
  { label: "Customers", href: "/app/customers", icon: "customers", available: true },
  { label: "Staff", href: "/app/staff", icon: "staff", available: true },
  { label: "Finance", href: "/app/finance", icon: "finance", available: true },
  { label: "Inventory", href: "/app/inventory", icon: "inventory", available: true },
  { label: "Reports", href: "/app/reports", icon: "reports", available: true },
  { label: "Settings", href: "/app/settings", icon: "settings", available: true },
];

export const BARBER_NAV: NavItem[] = [
  { label: "Today", href: "/barber", icon: "today", available: true, exact: true },
  { label: "Calendar", href: "/barber/calendar", icon: "calendar", available: true },
  { label: "Customers", href: "/barber/customers", icon: "customers", available: true },
  { label: "Earnings", href: "/barber/earnings", icon: "earnings", available: true },
  { label: "Profile", href: "/barber/profile", icon: "profile", available: true },
];
