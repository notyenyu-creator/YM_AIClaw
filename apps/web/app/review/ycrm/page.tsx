"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearningReviewWorkspace } from "@/app/components/learning-review-workspace";

function YcrmReviewBody() {
  const params = useSearchParams();
  const sessionId = params?.get("sessionId") ?? null;
  return <LearningReviewWorkspace system="ycrm" sessionId={sessionId} />;
}

export default function YcrmReviewPage() {
  return (
    <Suspense fallback={null}>
      <YcrmReviewBody />
    </Suspense>
  );
}
