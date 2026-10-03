/**
 * Yuvoy's support line, as a traveller reads it and as a phone dials it
 * (yuvoy-app#116).
 *
 * The same number the operator portal's Help and Settings use
 * (`SUPPORT_PHONE` in yuvoy-operator's src/lib/site/contact.ts), and the one
 * yuvoy-api's own "call us" sentences name since yuvoy-api#242 (it fixed a
 * wrong one, yuvoy-api#235). Written once here so this app has one copy to
 * change the day it changes.
 *
 * This app's other way to a person is the WhatsApp line in `SupportContact`,
 * which is configuration from the API and is null while Yuvoy has no support
 * WhatsApp. A phone call needs neither a WhatsApp account nor a signed-in
 * session, which is why a guest at checkout can always use it.
 *
 * Two forms because they are two jobs: the display form is read aloud or
 * copied onto paper, grouped the way an Indian number is said; the `tel:`
 * form is what a phone dials, digits only.
 */
export const SUPPORT_PHONE = "+91 81216 57657";

/** The same number, for a link a phone can dial. */
export const SUPPORT_PHONE_HREF = "tel:+918121657657";
