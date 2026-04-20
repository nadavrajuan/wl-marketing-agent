import { Suspense } from "react";
import CopyLabContent from "@/components/CopyLabContent";

export default function CopyLabPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
      <CopyLabContent />
    </Suspense>
  );
}
