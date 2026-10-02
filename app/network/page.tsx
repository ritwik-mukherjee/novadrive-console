import { Suspense } from "react";
import { NetworkView } from "@/components/network/NetworkView";

export default function Page() {
  return (
    <Suspense>
      <NetworkView />
    </Suspense>
  );
}
