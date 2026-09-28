// Shared conference-naming formula. Every call is placed into its own room
// named from the session (or "adhoc" for a widget/lead-detail call) plus
// the browser leg's own CallSid — deterministic, so twilio-add-participant
// can rebuild the same name from the client's own record of its call SID
// without a lookup.
export function conferenceNameFor(sessionId: string | null | undefined, callSid: string): string {
  return `ddlr_${sessionId ?? 'adhoc'}_${callSid}`;
}
