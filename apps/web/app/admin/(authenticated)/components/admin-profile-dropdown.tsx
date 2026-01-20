'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, LogOut, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { AdminSession } from '@/lib/admin-auth';
import Image from 'next/image';

interface AdminProfileDropdownProps {
  currentAdmin: AdminSession;
}

export default function AdminProfileDropdown({ currentAdmin }: AdminProfileDropdownProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
      });
      router.push('/admin/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const initials = currentAdmin?.name?.substring(0, 2).toUpperCase() || 'AD';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-1 px-1.5 hover:bg-accent h-10 transition-colors rounded-full"
        >
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs shrink-0 border border-border overflow-hidden relative">
            {currentAdmin?.profileImage ? (
              <Image src={currentAdmin.profileImage} alt={currentAdmin.name} fill className="object-cover" />
            ) : (
              initials
            )}
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" sideOffset={8}>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-semibold leading-none">{currentAdmin?.name}</p>
            <p className="text-xs leading-none text-muted-foreground mt-1 lowercase uppercase-first">
              {currentAdmin?.roleName?.replace('_', ' ') || 'Admin'}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/admin/profile" className="flex items-center w-full">
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-600 focus:text-red-600 cursor-pointer focus:bg-red-50 dark:focus:bg-red-950/30"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
