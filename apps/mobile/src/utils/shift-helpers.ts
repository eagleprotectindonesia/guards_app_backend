const EVENT_NOTE_PATTERN = /^\[(.+?) Event\] (.+?)(?:\n|$)/;

export function parseEventNote(note: string | null | undefined): {
  eventType: string | null;
  eventName: string | null;
} {
  if (!note) return { eventType: null, eventName: null };
  const match = note.match(EVENT_NOTE_PATTERN);
  if (!match) return { eventType: null, eventName: null };
  return { eventType: match[1], eventName: match[2] };
}
