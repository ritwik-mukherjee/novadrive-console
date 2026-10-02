import { Suspense } from "react";
import { AlertsView } from "@/components/alerts/AlertsView";

export default function Page() {
  return (
    <Suspense>
      <AlertsView />
    </Suspense>
  );
}
