'use client';

import { GlassLanguageToggle } from '@/components/glass-language-toggle';

export function TopNav() {
  return (
    <header className="sticky top-0 left-0 right-0 bg-[#0F0F0F]/90 backdrop-blur-md border-b border-white/5 z-40 px-6 py-3 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.5)]">
          <span className="text-white font-bold text-sm">EP</span>
        </div>
        <span className="font-bold text-white tracking-tight">EMPLOYEE</span>
      </div>

      <GlassLanguageToggle />
    </header>
  );
}
