import { Suspense } from "react";
import KeywordsContent from "@/components/KeywordsContent";

export default function KeywordsPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
      <KeywordsContent />
    </Suspense>
  );
}
