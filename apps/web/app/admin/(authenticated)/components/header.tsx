'use client';

import { useEffect, useState } from 'react';

function DigitalClock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    const timeout = setTimeout(() => {
      setTime(new Date());
    }, 0);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, []);

  if (!time) return null;

  return (
    <div className="flex items-center gap-2 text-[#334155] font-medium">
      <span className="text-lg tabular-nums">
        {time.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit'
        })}
      </span>
      <span className="text-gray-400">·</span>
      <span className="text-gray-500 font-normal">
        {time.toLocaleDateString('en-GB', { 
          weekday: 'short', 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric' 
        })}
      </span>
    </div>
  );
}

export default function Header() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <DigitalClock />
      </div>
      
      <div className="flex-1" />
    </header>
  );
}
