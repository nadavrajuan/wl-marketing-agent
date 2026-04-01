import { Suspense } from "react";
import ExplorerContent from "@/components/ExplorerContent";

export default function ExplorerPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
      <ExplorerContent />
    </Suspense>
  );
}
