import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Cake } from 'lucide-react';

type Birthday = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  dateOfBirth: Date;
  birthdayDate: Date;
  daysUntil: number;
};

type Props = {
  birthdays: Birthday[];
};

function formatBirthday(birthdayDate: Date): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(birthdayDate);
}

function getDayLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `in ${daysUntil} days`;
}

export function UpcomingBirthdays({ birthdays }: Props) {
  return (
    <Card className="border-border/60 bg-card shadow-md w-full h-full flex flex-col">
      <CardHeader className="border-b border-border/45 pb-4 shrink-0">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-foreground">Upcoming Birthdays</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Birthdays in the next 7 days.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="py-4 flex-1 overflow-y-auto max-h-[320px] space-y-3">
        {birthdays.length === 0 ? (
          <div className="flex items-center justify-center p-6 min-h-[200px]">
            <div className="flex flex-col items-center gap-2 text-center">
              <Cake className="h-5 w-5 text-muted-foreground/40" />
              <span className="text-sm text-muted-foreground/60">No birthdays this week.</span>
            </div>
          </div>
        ) : (
          birthdays.map(bday => (
            <div
              key={bday.id}
              className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] shrink-0">
                  <Cake className="h-4 w-4 text-rose-500" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-foreground truncate">
                    {bday.fullName}
                    {bday.employeeNumber && (
                      <span className="text-muted-foreground/60 font-normal ml-1.5">
                        #{bday.employeeNumber}
                      </span>
                    )}
                  </span>
                  <span className="text-[9px] text-muted-foreground/65">
                    {formatBirthday(bday.birthdayDate)}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-medium text-muted-foreground/80 shrink-0 ml-2">
                {getDayLabel(bday.daysUntil)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
