import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/supabase/server";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { user, membership, supabase } = await getSessionContext();
  if (!user) redirect("/login");
  if (membership) redirect("/dashboard");
  const sp = await searchParams;
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
  return (
    <Onboarding
      name={profile?.display_name ?? ""}
      initialCode={typeof sp.code === "string" ? sp.code.toUpperCase() : ""}
    />
  );
}
