import { notFound } from "next/navigation";
import { FormSkeleton, ListSkeleton } from "@/components/features/shell/page-skeleton";
import { authGateway } from "@/server/composition-root/auth-gateway";

export const metadata = { title: "Skeletons (test mode)" };

/**
 * Test mode only: shows the loading skeletons on a page of their own so end-to-end tests can check them (animation, motion
 * settings, accessibility) without having to catch a real page mid-load. Does not exist anywhere else.
 */
export default function TestSkeleton() {
  if (!authGateway.isTestMode()) notFound();
  return (
    <div className="flex flex-col gap-16 px-6 py-10">
      <ListSkeleton />
      <FormSkeleton />
    </div>
  );
}
