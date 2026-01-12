'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageSquare, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function BottomNav() {
  const { t } = useTranslation();
  const pathname = usePathname();

  const navItems = [
    {
      label: t('tabs.home'),
      href: '/guard',
      icon: Home,
      isActive: pathname === '/guard',
    },
    {
      label: t('tabs.chat'),
      href: '/guard/chat',
      icon: MessageSquare,
      isActive: pathname === '/guard/chat',
    },
    {
      label: t('tabs.account'),
      href: '/guard/account',
      icon: User,
      isActive: pathname === '/guard/account',
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center z-50">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex flex-col items-center gap-1 transition-colors',
            item.isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
          )}
        >
          <item.icon className={cn('h-6 w-6', item.isActive && 'fill-blue-600/10')} />
          <span className="text-[10px] font-medium uppercase tracking-wider">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
