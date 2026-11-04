import { redirect } from "next/navigation";

/** Shareable invite link: /join/ABCD2345 */
export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  redirect(`/onboarding?code=${encodeURIComponent(code)}`);
}
