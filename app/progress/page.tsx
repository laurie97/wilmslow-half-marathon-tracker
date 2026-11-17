import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAthleteId } from "@/lib/auth";
import ProgressDashboard from "../components/ProgressDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Progress · Wilmslow Half tracker",
};

/** Season progress charts; sends signed-out visitors to the sign-in page. */
export default async function ProgressPage() {
  const athleteId = await currentAthleteId();
  if (athleteId === null) {
    redirect("/");
  }
  const page = <ProgressDashboard />;
  return page;
}
