'use client';

import { ShiftWithRelations } from '@/app/admin/(authenticated)/shifts/components/shift-list';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { NextShiftCard } from './next-shift-card';
import { ShiftInfoCard } from './shift-info-card';

interface EmployeeCarouselProps {
  activeShift: ShiftWithRelations | null;
  nextShifts: ShiftWithRelations[];
}

export function EmployeeCarousel({ activeShift, nextShifts }: EmployeeCarouselProps) {
  const totalSlides = (activeShift ? 1 : 0) + nextShifts.length;
  const showNavigation = totalSlides > 1;

  return (
    <div className="relative">
      <Carousel className="w-full mb-6">
        <CarouselContent>
          {activeShift && (
            <CarouselItem>
              <div className="p-1">
                <ShiftInfoCard shift={activeShift} />
              </div>
            </CarouselItem>
          )}
          {nextShifts.map(shift => (
            <CarouselItem key={shift.id}>
              <div className="p-1">
                <NextShiftCard shift={shift} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {showNavigation && (
          <>
            <CarouselPrevious className="absolute top-1/2 left-2 -translate-y-1/2 z-10 bg-transparent border-none text-blue-600 hover:text-blue-800 p-0 w-auto h-auto" />
            <CarouselNext className="absolute top-1/2 right-2 -translate-y-1/2 z-10 bg-transparent border-none text-blue-600 hover:text-blue-800 p-0 w-auto h-auto" />
          </>
        )}
      </Carousel>
    </div>
  );
}