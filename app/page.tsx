import { currentAthleteId } from "@/lib/auth";
import { isDemo } from "@/lib/config";
import SignIn from "./components/SignIn";
import Tracker from "./components/Tracker";

export const dynamic = "force-dynamic";

/** Shows the sign-in screen or the tracker, depending on the session cookie. */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const athleteId = await currentAthleteId();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const page =
    athleteId === null ? <SignIn error={error} demo={isDemo()} /> : <Tracker />;
  return page;
}
