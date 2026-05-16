import { getUnreadCount } from './data-access/chat';
import { setChatUnreadCountProvider } from '@repo/notifications';

setChatUnreadCountProvider(getUnreadCount);

export * from '@repo/notifications';
