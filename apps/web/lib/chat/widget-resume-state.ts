import { ConversationSelection } from './conversation-selection';

const STORAGE_KEY = 'admin-chat-widget-resume';
const TTL_MS = 60_000;

type WidgetResumeState = {
  isOpen: true;
  selection: ConversationSelection;
  createdAt: number;
};

export function saveWidgetResumeState(selection: ConversationSelection) {
  if (typeof window === 'undefined') return;
  const payload: WidgetResumeState = {
    isOpen: true,
    selection,
    createdAt: Date.now(),
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function consumeWidgetResumeState(): WidgetResumeState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(STORAGE_KEY);

  try {
    const parsed = JSON.parse(raw) as WidgetResumeState;
    if (!parsed?.isOpen || typeof parsed.createdAt !== 'number') return null;
    if (Date.now() - parsed.createdAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
