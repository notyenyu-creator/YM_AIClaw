"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearningReviewWorkspace } from "@/app/components/learning-review-workspace";

function ErpReviewBody() {
  const params = useSearchParams();
  const sessionId = params?.get("sessionId") ?? null;
  return <LearningReviewWorkspace system="erp" sessionId={sessionId} />;
}

export default function ErpReviewPage() {
  return (
    <Suspense fallback={null}>
      <ErpReviewBody />
    </Suspense>
  );
}
