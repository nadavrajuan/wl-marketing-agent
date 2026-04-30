import { Suspense } from "react";
import DataDashboardContent from "@/components/DataDashboardContent";

export default function DataDashboardPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
      <DataDashboardContent />
    </Suspense>
  );
}
