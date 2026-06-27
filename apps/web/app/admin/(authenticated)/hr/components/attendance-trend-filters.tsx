'use client';

import React, { useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@repo/shared';
import { ChevronDown, X } from 'lucide-react';
import type { LocationOption } from '@repo/database';

type Props = {
  departments: string[];
  locations: LocationOption[];
  selectedDepartments: string[];
  selectedOfficeIds: string[];
  selectedSiteIds: string[];
};

function MultiSelectPopover<T extends string | LocationOption>({
  label,
  items,
  renderItem,
  isSelected,
  onToggle,
  getKey,
}: {
  label: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  isSelected: (item: T) => boolean;
  onToggle: (item: T) => void;
  getKey: (item: T) => string;
}) {
  const selectedCount = items.filter(isSelected).length;
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 text-xs font-normal gap-1.5 border-border/60',
            selectedCount > 0 && 'border-blue-400/50 bg-blue-500/5'
          )}
        >
          {label}
          {selectedCount > 0 && (
            <span className="ml-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-semibold px-1.5 py-0.5">
              {selectedCount}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-3 text-center">No options</p>
          )}
          {items.map((item) => {
            const key = getKey(item);
            return (
              <label
                key={key}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/60 cursor-pointer text-xs"
              >
                <Checkbox
                  checked={isSelected(item)}
                  onCheckedChange={() => onToggle(item)}
                  className="h-3.5 w-3.5"
                />
                {renderItem(item)}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AttendanceTrendFilters({
  departments,
  locations,
  selectedDepartments,
  selectedOfficeIds,
  selectedSiteIds,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedDeptSet = new Set(selectedDepartments);
  const selectedOfficeSet = new Set(selectedOfficeIds);
  const selectedSiteSet = new Set(selectedSiteIds);

  const buildHref = useCallback(
    (depts: string[], offIds: string[], siteIds: string[]) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (depts.length > 0) sp.set('department', depts.join(','));
      else sp.delete('department');
      const locParts: string[] = [
        ...offIds.map((id) => `o:${id}`),
        ...siteIds.map((id) => `s:${id}`),
      ];
      if (locParts.length > 0) sp.set('location', locParts.join(','));
      else sp.delete('location');
      return `${pathname}?${sp.toString()}`;
    },
    [pathname, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.push(buildHref([], [], []));
  }, [router, buildHref]);

  const hasFilters = selectedDepartments.length > 0 || selectedOfficeIds.length > 0 || selectedSiteIds.length > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <MultiSelectPopover<string>
        label="Department"
        items={departments}
        getKey={(d) => d}
        renderItem={(d) => <span>{d}</span>}
        isSelected={(d) => selectedDeptSet.has(d)}
        onToggle={(d) => {
          const next = selectedDeptSet.has(d)
            ? selectedDepartments.filter((x) => x !== d)
            : [...selectedDepartments, d];
          router.push(buildHref(next, selectedOfficeIds, selectedSiteIds));
        }}
      />

      <MultiSelectPopover<LocationOption>
        label="Location"
        items={locations}
        getKey={(l) => `${l.type}:${l.id}`}
        renderItem={(l) => (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">{l.name}</span>
            <span
              className={cn(
                'shrink-0 text-[10px] font-medium px-1 py-0.5 rounded',
                l.type === 'office'
                  ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              )}
            >
              {l.type === 'office' ? 'Office' : 'Site'}
            </span>
          </div>
        )}
        isSelected={(l) =>
          l.type === 'office' ? selectedOfficeSet.has(l.id) : selectedSiteSet.has(l.id)
        }
        onToggle={(l) => {
          if (l.type === 'office') {
            const next = selectedOfficeSet.has(l.id)
              ? selectedOfficeIds.filter((x) => x !== l.id)
              : [...selectedOfficeIds, l.id];
            router.push(buildHref(selectedDepartments, next, selectedSiteIds));
          } else {
            const next = selectedSiteSet.has(l.id)
              ? selectedSiteIds.filter((x) => x !== l.id)
              : [...selectedSiteIds, l.id];
            router.push(buildHref(selectedDepartments, selectedOfficeIds, next));
          }
        }}
      />

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
        >
          <X className="h-3 w-3" />
          Clear filters
        </Button>
      )}

      {selectedDepartments.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {selectedDepartments.slice(0, 3).map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium text-foreground"
            >
              {d}
              <button
                type="button"
                onClick={() => {
                  router.push(buildHref(selectedDepartments.filter((x) => x !== d), selectedOfficeIds, selectedSiteIds));
                }}
                className="hover:text-destructive"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {selectedDepartments.length > 3 && (
            <span className="text-[11px] text-muted-foreground">+{selectedDepartments.length - 3} more</span>
          )}
        </div>
      )}

      {(selectedOfficeIds.length > 0 || selectedSiteIds.length > 0) && (
        <div className="flex items-center gap-1 flex-wrap">
          {[...selectedOfficeIds, ...selectedSiteIds].slice(0, 3).map((id) => {
            const loc = locations.find((l) => l.id === id);
            if (!loc) return null;
            return (
              <span
                key={`${loc.type}:${loc.id}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium text-foreground"
              >
                {loc.name}
                <button
                  type="button"
                  onClick={() => {
                    const nextOfficeIds = loc.type === 'office'
                      ? selectedOfficeIds.filter((x) => x !== loc.id)
                      : selectedOfficeIds;
                    const nextSiteIds = loc.type === 'site'
                      ? selectedSiteIds.filter((x) => x !== loc.id)
                      : selectedSiteIds;
                    router.push(buildHref(selectedDepartments, nextOfficeIds, nextSiteIds));
                  }}
                  className="hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
          {(selectedOfficeIds.length + selectedSiteIds.length) > 3 && (
            <span className="text-[11px] text-muted-foreground">
              +{selectedOfficeIds.length + selectedSiteIds.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
