'use client';

import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

type DateRangeFilterProps = {
  from?: Date;
  to?: Date;
  onChange: (from: Date | undefined, to: Date | undefined) => void;
  fromLabel?: string;
  toLabel?: string;
};

export default function DateRangeFilter({
  from,
  to,
  onChange,
  fromLabel = 'Start Date',
  toLabel = 'End Date',
}: DateRangeFilterProps) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">{fromLabel}</label>
        <DatePicker
          selected={from}
          onChange={date => onChange(date as Date, to)}
          selectsStart
          startDate={from}
          endDate={to}
          maxDate={to}
          dateFormat="yyyy-MM-dd"
          className="h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
          placeholderText="Start Date"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">{toLabel}</label>
        <DatePicker
          selected={to}
          onChange={date => onChange(from, date as Date)}
          selectsEnd
          startDate={from}
          endDate={to}
          minDate={from}
          dateFormat="yyyy-MM-dd"
          className="h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
          placeholderText="End Date"
        />
      </div>
    </>
  );
}
