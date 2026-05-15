import {
  buildConversationUrl,
  isSameConversation,
  parseConversationSelection,
} from '@/lib/chat/conversation-selection';

describe('conversation selection', () => {
  test('parses new direct url', () => {
    const params = new URLSearchParams('conversationKind=direct&conversationId=emp-1');
    expect(parseConversationSelection(params)).toEqual({ kind: 'direct', id: 'emp-1' });
  });

  test('parses new group url', () => {
    const params = new URLSearchParams('conversationKind=group&conversationId=group-1');
    expect(parseConversationSelection(params)).toEqual({ kind: 'group', id: 'group-1' });
  });

  test('parses legacy employee id url', () => {
    const params = new URLSearchParams('employeeId=emp-legacy&employeeName=Alice');
    expect(parseConversationSelection(params)).toEqual({ kind: 'direct', id: 'emp-legacy' });
  });

  test('builds direct and group urls', () => {
    expect(buildConversationUrl({ kind: 'direct', id: 'emp-1' })).toBe(
      '/admin/chat?conversationKind=direct&conversationId=emp-1'
    );
    expect(buildConversationUrl({ kind: 'group', id: 'group-1' })).toBe(
      '/admin/chat?conversationKind=group&conversationId=group-1'
    );
  });

  test('compares conversation identity with kind + id', () => {
    expect(isSameConversation({ kind: 'direct', id: '1' }, { kind: 'direct', id: '1' })).toBe(true);
    expect(isSameConversation({ kind: 'direct', id: '1' }, { kind: 'group', id: '1' })).toBe(false);
    expect(isSameConversation(null, null)).toBe(true);
  });
});
