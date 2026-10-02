"use client";

import Link from "next/link";
import { EventDetail } from "@/components/alerts/EventDetail";
import { useAlertFeed } from "@/lib/alertStore";

export function EventDrawer({ id }: { id: string }) {
  const item = useAlertFeed().find((f) => f.event.id === id);
  if (!item) return <p className="text-muted">Unknown event {id}.</p>;
  return (
    <div className="space-y-4">
      <EventDetail item={item} inDrawer />
      <Link href={`/alerts?event=${id}`} className="text-xs text-muted underline">
        Open in the Alerts screen
      </Link>
    </div>
  );
}
