"use client";

import { useFamily } from "@/components/family-provider";
import { MemberView } from "@/components/member-view";

export default function MePage() {
  const { me } = useFamily();
  return <MemberView member={me} />;
}
