import { AIWorkspace } from "@/components/ai-workspace";
import { requirePageUser } from "@/lib/session";

export default async function AIWorkspacePage() {
  await requirePageUser();
  return <AIWorkspace />;
}

