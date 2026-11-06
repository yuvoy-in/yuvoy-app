import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query/policy";
import { resetSavedSession } from "@/lib/feed/account-saved";
import { clearDraft as clearTrigoDraft } from "@/lib/trigo/keys";
import { forgetTrigoCheckouts } from "@/lib/trigo/checkout-prefill";

/*
  What `useTravellerSession` drops from the cache, and from this device, when
  the person signed in changes: its `refresh` and `signOut` call each of these.
  Kept beside the hook in their own file so `use-traveller.ts` stays under 500
  lines (yuvoy-app#243). Nothing here is a hook.
*/

/**
 * Saves, on both sides of a change of who is signed in (yuvoy-api#192).
 *
 * REMOVED rather than invalidated, for the reason `refresh` gives below: the
 * account's set belongs to a number, and an invalidated entry would paint the
 * previous number's saves while the refetch ran. The device's set goes too,
 * because signing in moves it onto the account underneath its cache.
 */
/**
 * Help requests, on both sides of a change of who is signed in
 * (yuvoy-api#196).
 *
 * REMOVED rather than invalidated, for the reason `refresh` gives: they belong
 * to a number, and an invalidated list would show the previous number's
 * messages to us, in their own words, while the refetch ran.
 */
function forgetSupportRequests(qc: QueryClient): void {
  qc.removeQueries({ queryKey: qk.supportRequests() });
  qc.removeQueries({ queryKey: ["getSupportRequest"] });
}

/**
 * People (yuvoy-app#222): the home, the friends list and any friend link
 * looked up. Removed, for the reason `forgetSupportRequests` gives: they are
 * a number's own friends and requests, by name.
 */
function forgetPeople(qc: QueryClient): void {
  qc.removeQueries({ queryKey: qk.myPeople() });
  qc.removeQueries({ queryKey: qk.myFriends() });
  qc.removeQueries({ queryKey: ["lookupFriendLink"] });
  qc.removeQueries({ queryKey: qk.myCrews() });
}

/**
 * Trigo, on both sides of a change of who is signed in (yuvoy-app#223).
 *
 * REMOVED rather than invalidated, for the reason `refresh` gives: a chat is
 * the number's own, in the traveller's own words. The unsent text goes too,
 * so the next person never sends the previous one's message under its key,
 * and so does each card's checkout, so they never book under its card key.
 */
function forgetTrigo(qc: QueryClient): void {
  qc.removeQueries({ queryKey: qk.trigoConsent() });
  qc.removeQueries({ queryKey: qk.trigoConversations() });
  qc.removeQueries({ queryKey: ["getTrigoConversation"] });
  clearTrigoDraft();
  forgetTrigoCheckouts();
}

/**
 * Me's life list, badges and settings (yuvoy-mobile#444), on both sides of a
 * change of who is signed in. Removed, for the reason `refresh` gives: the list
 * carries the person's own photos as signed links, and the next person must
 * never see them while their own list is read.
 */
function forgetMe(qc: QueryClient): void {
  qc.removeQueries({ queryKey: qk.myLifeList() });
  qc.removeQueries({ queryKey: qk.myBadges() });
  qc.removeQueries({ queryKey: qk.mySettings() });
}

function forgetSaved(qc: QueryClient): void {
  /*
    First, so nothing started for the previous number (an adoption, a queued
    write) reaches the next one's account or cache. See `resetSavedSession`.
  */
  resetSavedSession();
  qc.removeQueries({ queryKey: qk.savedIds("account") });
  qc.removeQueries({ queryKey: qk.savedList("account") });
  qc.removeQueries({ queryKey: qk.savedIds("device") });
  qc.removeQueries({ queryKey: qk.savedList("device") });
}

export {
  forgetSupportRequests,
  forgetPeople,
  forgetTrigo,
  forgetMe,
  forgetSaved,
};
