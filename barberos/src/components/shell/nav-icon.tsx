import {
  BarChart3,
  CalendarDays,
  CircleUserRound,
  LayoutGrid,
  Package,
  Settings,
  Sun,
  Users,
  UserSquare2,
  Wallet,
  Coins,
} from "lucide-react";
import type { NavItem } from "./nav-config";

const ICONS = {
  overview: LayoutGrid,
  calendar: CalendarDays,
  customers: Users,
  staff: UserSquare2,
  finance: Wallet,
  inventory: Package,
  reports: BarChart3,
  settings: Settings,
  today: Sun,
  earnings: Coins,
  profile: CircleUserRound,
} as const;

export function NavIcon({ name, className }: { name: NavItem["icon"]; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
