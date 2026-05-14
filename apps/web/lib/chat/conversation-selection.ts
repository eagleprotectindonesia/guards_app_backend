export type ConversationSelection =
  | { kind: 'direct'; id: string }
  | { kind: 'group'; id: string }
  | null;

export function parseConversationSelection(searchParams: URLSearchParams): ConversationSelection {
  const kind = searchParams.get('conversationKind');
  const id = searchParams.get('conversationId');

  if ((kind === 'direct' || kind === 'group') && id) {
    return { kind, id };
  }

  const legacyEmployeeId = searchParams.get('employeeId');
  if (legacyEmployeeId) {
    return { kind: 'direct', id: legacyEmployeeId };
  }

  return null;
}

export function buildConversationUrl(selection: ConversationSelection): string {
  if (!selection) return '/admin/chat';

  const params = new URLSearchParams();
  params.set('conversationKind', selection.kind);
  params.set('conversationId', selection.id);
  return `/admin/chat?${params.toString()}`;
}

export function isSameConversation(a: ConversationSelection, b: ConversationSelection): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.id === b.id;
}
