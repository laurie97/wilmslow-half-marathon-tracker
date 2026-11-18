import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAthleteId } from "@/lib/auth";
import CompareDashboard from "../components/CompareDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare · Wilmslow Half tracker",
};

/** Every athlete's runs done and distance; sends signed-out visitors to sign in. */
export default async function ComparePage() {
  const athleteId = await currentAthleteId();
  if (athleteId === null) {
    redirect("/");
  }
  const page = <CompareDashboard />;
  return page;
}
