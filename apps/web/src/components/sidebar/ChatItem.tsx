import { Link } from "@tanstack/react-router";

import { resolveThreadRowClassName, resolveThreadStatusPill } from "../Sidebar.logic";
import { buildThreadRouteParams } from "../../threadRoutes";
import type { SidebarThreadSummary } from "../../types";

interface ChatItemProps {
  readonly isActive: boolean;
  readonly thread: SidebarThreadSummary;
}

export function ChatItem({ isActive, thread }: ChatItemProps) {
  const pill = resolveThreadStatusPill({ thread });

  return (
    <Link
      className={resolveThreadRowClassName({
        isActive,
        isSelected: false,
      })}
      data-thread-item
      to="/$environmentId/$threadId"
      params={buildThreadRouteParams({
        environmentId: thread.environmentId,
        threadId: thread.id,
      })}
    >
      <span className="min-w-0 flex-1 truncate text-xs">{thread.title}</span>
      {pill ? (
        <span className={`inline-flex items-center gap-1 text-[10px] ${pill.colorClass}`}>
          <span
            className={`size-1.5 rounded-full ${pill.dotClass} ${pill.pulse ? "animate-pulse" : ""}`}
          />
          <span className="hidden truncate md:inline">{pill.label}</span>
        </span>
      ) : null}
    </Link>
  );
}
