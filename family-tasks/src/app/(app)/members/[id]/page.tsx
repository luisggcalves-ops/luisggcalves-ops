"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, UserX } from "lucide-react";
import { useFamily } from "@/components/family-provider";
import { MemberView } from "@/components/member-view";
import { EmptyState } from "@/components/ui";

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const { memberById } = useFamily();
  const member = memberById(id);
  return (
    <>
      <Link href="/members" className="btn-ghost -ml-3 mb-3 h-8 text-muted">
        <ArrowLeft className="size-4" /> Family
      </Link>
      {member ? <MemberView member={member} /> : <EmptyState icon={UserX} title="Member not found" body="They may have left the family." />}
    </>
  );
}
