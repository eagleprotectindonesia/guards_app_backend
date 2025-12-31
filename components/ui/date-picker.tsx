'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DatePickerProps {
  date?: Date;
  setDate: (date?: Date) => void;
  placeholder?: string;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

export function DatePicker({
  date,
  setDate,
  placeholder = 'Pick a date',
  className,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDate(null as unknown as Date);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 flex flex-col" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          fromDate={minDate}
          toDate={maxDate}
          initialFocus
        />
        {date && (
          <div className="p-2 border-t border-gray-100">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleClear}
            >
              <X className="mr-2 h-3 w-3" />
              Clear Selection
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
