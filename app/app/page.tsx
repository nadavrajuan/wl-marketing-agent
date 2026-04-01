import { Suspense } from "react";
import DashboardContent from "@/components/DashboardContent";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
