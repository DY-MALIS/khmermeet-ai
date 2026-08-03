import { AIWorkspace } from "@/components/ai-workspace";
import { requireUser } from "@/lib/session";

export default async function AIWorkspacePage() {
  await requireUser();
  return <AIWorkspace />;
}
