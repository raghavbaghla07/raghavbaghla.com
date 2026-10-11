import type { Metadata } from "next";
import { Studio } from "@/components/studio";
export const metadata: Metadata = {
  title: "Writing studio",
  robots: { index: false, follow: false },
};
export default function StudioPage() {
  return <Studio />;
}
