import { Suspense } from "react";
import { AlternatesView } from "@/components/alternates/AlternatesView";

export default function Page() {
  return (
    <Suspense>
      <AlternatesView />
    </Suspense>
  );
}
