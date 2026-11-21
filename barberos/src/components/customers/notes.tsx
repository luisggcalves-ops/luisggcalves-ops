import { Scissors, StickyNote } from "lucide-react";
import type { customerNotes } from "@/server/db/schema";
import { ActionButton } from "@/components/ui/action-button";
import { deleteNoteAction } from "@/app/actions/customers";
import { AddNoteForm } from "./add-note-form";

type Note = typeof customerNotes.$inferSelect;

export function NotesTimeline({
  notes,
  timeZone,
  canDelete,
  empty = "No notes yet. Add how they like their cut, so anyone can do it next time.",
}: {
  notes: Note[];
  timeZone: string;
  canDelete: (note: Note) => boolean;
  empty?: string;
}) {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" });
  if (!notes.length) return <p className="text-[13px] text-fg-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {notes.map((n) => (
        <li key={n.id} className="flex gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-muted">
            {n.kind === "haircut" ? <Scissors className="size-3.5" /> : <StickyNote className="size-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap text-sm">{n.body}</p>
            <p className="mt-0.5 text-[12px] text-fg-subtle">
              {n.authorName} · {fmt.format(n.createdAt)}
            </p>
          </div>
          {canDelete(n) ? (
            <ActionButton action={deleteNoteAction} fields={{ noteId: n.id }} confirm="Delete this note?" ariaLabel="Delete note">
              Delete
            </ActionButton>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export { AddNoteForm };
