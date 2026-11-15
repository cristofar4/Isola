import { redirect } from "next/navigation";
import { Suspense } from "react";

async function Go({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/studio/motion/${encodeURIComponent(id)}`);
  return null;
}

/** Films used to open full-window at /motion/<id>; the editor now lives inside the studio. */
export default function OldFilmPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Go params={params} />
    </Suspense>
  );
}
