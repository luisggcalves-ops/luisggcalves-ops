import { PageHeader } from "@/components/ui/page-header";
import { TabsNav } from "@/components/ui/tabs-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Your shop's details, hours and your account." />
      <TabsNav
        tabs={[
          { href: "/app/settings", label: "Shop profile" },
          { href: "/app/settings/hours", label: "Opening hours" },
          { href: "/app/settings/account", label: "Account" },
        ]}
      />
      <div className="max-w-3xl">{children}</div>
    </>
  );
}
