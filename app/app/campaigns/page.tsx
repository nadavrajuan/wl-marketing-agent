import { Suspense } from "react";
import CampaignsContent from "@/components/CampaignsContent";

export default function CampaignsPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
      <CampaignsContent />
    </Suspense>
  );
}
