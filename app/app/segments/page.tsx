import { Suspense } from "react";
import SegmentsContent from "@/components/SegmentsContent";

export default function SegmentsPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
      <SegmentsContent />
    </Suspense>
  );
}
