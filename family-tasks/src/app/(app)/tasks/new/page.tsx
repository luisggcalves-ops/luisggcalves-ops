"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useFamily } from "@/components/family-provider";
import { TaskForm } from "@/components/task-form";
import { useToast } from "@/components/toast";

function NewTask() {
  const router = useRouter();
  const params = useSearchParams();
  const { createTask, memberById } = useFamily();
  const toast = useToast();
  const assignee = params.get("assignee");

  return (
    <div className="mx-auto max-w-2xl animate-rise">
      <p className="section-title mb-4">New task</p>
      <div className="card p-5 sm:p-7">
        <TaskForm
          submitLabel="Create task"
          defaultAssignee={assignee && memberById(assignee) ? assignee : undefined}
          onCancel={() => router.back()}
          onSubmit={async (input) => {
            const t = await createTask(input);
            const who = memberById(t.assigned_to)?.profile.display_name;
            toast.show({ tone: "success", title: "Task created", body: who ? `${t.title} → ${who}` : t.title });
            router.push(`/tasks/${t.id}`);
          }}
        />
      </div>
    </div>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense>
      <NewTask />
    </Suspense>
  );
}
