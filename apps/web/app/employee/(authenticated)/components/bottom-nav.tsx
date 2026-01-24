'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageSquare, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useUnreadCount } from '../hooks/use-chat-queries';
import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/components/socket-provider';
import { useQueryClient } from '@tanstack/react-query';

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { data: unreadData } = useUnreadCount();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audio Logic for Chat
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/audios/chat.wav');
    }

    const unlockAudio = () => {
      if (audioRef.current) {
        audioRef.current
          .play()
          .then(() => {
            audioRef.current?.pause();
            if (audioRef.current) audioRef.current.currentTime = 0;
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
          })
          .catch(() => {});
      }
    };

    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => console.error('Failed to play chat sound', err));
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    console.log('BottomNav: Socket listeners attached. ID:', socket.id);

    const handleNewMessage = (message: any) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] });

      // Play sound if message is from admin
      if (message.sender === 'admin') {
        playNotificationSound();
      }
    };

    const handleMessagesRead = () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
    };

    socket.on('new_message', handleNewMessage);
    socket.on('messages_read', handleMessagesRead);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('messages_read', handleMessagesRead);
    };
  }, [socket, queryClient, playNotificationSound]);

  const navItems = [
    {
      label: t('tabs.home'),
      href: '/employee',
      icon: Home,
      isActive: pathname === '/employee',
    },
    {
      label: t('tabs.chat'),
      href: '/employee/chat',
      icon: MessageSquare,
      isActive: pathname === '/employee/chat',
      badge: unreadData?.count || 0,
    },
    {
      label: t('tabs.account'),
      href: '/employee/account',
      icon: User,
      isActive: pathname === '/employee/account',
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center z-50">
      {navItems.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex flex-col items-center gap-1 transition-colors flex-1 py-1',
            item.isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
          )}
        >
          <div className="relative">
            <item.icon className={cn('h-6 w-6', item.isActive && 'fill-blue-600/10')} />
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center border-2 border-white shadow-sm">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}