import { Matcher } from "@/components/matcher";
import { setupStatus } from "@/lib/config";

export const dynamic = "force-dynamic";
export default function Home() {
  return <Matcher setup={setupStatus()} />;
}
