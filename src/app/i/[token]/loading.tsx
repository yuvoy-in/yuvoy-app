import { InviteSkeleton } from "@/components/trips/invite-skeleton";

export default function Loading() {
  // The invitation's own first paint, the same one the screen draws while it
  // reads the trip and the session, so a link from a chat is one shape.
  return <InviteSkeleton />;
}
