import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/supabase/server";
import { FamilyProvider } from "@/components/family-provider";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, membership } = await getSessionContext();
  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding");

  return (
    <FamilyProvider userId={user.id} familyId={membership.family_id}>
      <AppShell>{children}</AppShell>
    </FamilyProvider>
  );
}
