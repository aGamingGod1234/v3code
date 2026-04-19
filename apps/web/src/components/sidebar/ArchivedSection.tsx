import { ArchiveIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface ArchivedSectionProps {
  readonly count: number;
}

export function ArchivedSection({ count }: ArchivedSectionProps) {
  if (count === 0) {
    return null;
  }

  return (
    <Link
      to="/settings/archived"
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <ArchiveIcon className="size-3.5" />
      <span className="flex-1">Archived</span>
      <span>{count}</span>
    </Link>
  );
}
