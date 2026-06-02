"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearningReviewWorkspace } from "@/app/components/learning-review-workspace";

function EnmsReviewBody() {
  const params = useSearchParams();
  const sessionId = params?.get("sessionId") ?? null;
  return <LearningReviewWorkspace system="enms" sessionId={sessionId} />;
}

export default function EnmsReviewPage() {
  return (
    <Suspense fallback={null}>
      <EnmsReviewBody />
    </Suspense>
  );
}
