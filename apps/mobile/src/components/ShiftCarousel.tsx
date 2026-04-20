import React, { useRef, useState } from 'react';
import { ScrollView, Dimensions, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import { CalendarCheck, MapPin, CalendarClock } from 'lucide-react-native';
import { useSettings } from '../hooks/useSettings';
import { parseShiftCarouselDisplayDate } from './shift-carousel-date';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48; // Full width minus padding (24 * 2)

interface ShiftCarouselProps {
  activeShift: ShiftWithRelations | null | undefined;
  nextShifts: ShiftWithRelations[];
}

export default function ShiftCarousel({ activeShift, nextShifts }: ShiftCarouselProps) {
  useSettings();

  const { t, i18n } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const totalShifts = (activeShift ? 1 : 0) + nextShifts.length;
  const dateLocale = i18n.language === 'id' ? id : enUS;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / (CARD_WIDTH + 16));
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  const renderActiveShiftCard = (shift: ShiftWithRelations) => {
    const displayDate = parseShiftCarouselDisplayDate({ shiftDate: shift.date, startsAt: shift.startsAt });

    return (
      <Box
        key={shift.id}
        className="rounded-[32px] overflow-hidden bg-background-900 border border-outline-800 relative"
        style={{ width: CARD_WIDTH, marginRight: 16 }}
      >
        {/* Red Glow Effect */}
        <Box
          className="absolute -top-7.5 -right-7.5 w-32 h-32 bg-brand-500 opacity-[0.03] rounded-full"
          style={{ transform: [{ translateX: 30 }, { translateY: -30 }] }}
        />

        {/* Left Border Gradient Effect (Mocked with Box) */}
        <Box className="absolute left-0 top-0 bottom-0 w-[2px] bg-brand-600 opacity-50" />

        <Box className="p-6">
          {/* Header */}
          <HStack className="justify-between items-center mb-6">
            <HStack space="md" className="items-center">
              <Box className="w-8 h-8 rounded-xl bg-background-800 items-center justify-center border border-outline-700">
                <CalendarCheck size={16} color="#D92323" />
              </Box>
              <VStack>
                <Text size="sm" className="text-white font-medium">
                  {t('shift.currentTitle')}
                </Text>
              </VStack>
            </HStack>
            <Box className="bg-brand-500/15 border border-brand-500/30 px-3 py-1.5 rounded-full">
              <Text size="sm" className="text-brand-500 font-extrabold uppercase tracking-[2px]">
                {t('shift.activeStatus')}
              </Text>
            </Box>
          </HStack>

          {/* Details */}
          <VStack space="md">
            <HStack space="md" className="items-center">
              <Box className="flex-1">
                <Text size="xs" className="text-typography-500 uppercase tracking-[1.5px] mb-1.5 font-semibold">
                  {t('shift.station')}
                </Text>
                <HStack space="xs" className="items-center">
                  <MapPin size={14} color="#D92323" />
                  <Text size="md" className="text-typography-200 font-medium">
                    {shift.site?.name || t('shift.defaultLocation')}
                  </Text>
                </HStack>
              </Box>
              <Box className="flex-1 items-flex-end">
                <Text size="xs" className="text-typography-500 uppercase tracking-[1.5px] mb-1.5 font-semibold">
                  {t('shift.timeframe')}
                </Text>
                <Text size="md" className="text-white font-medium tracking-[0.5px]">
                  {format(new Date(shift.startsAt), 'HH:mm', { locale: dateLocale })} —{' '}
                  {format(new Date(shift.endsAt), 'HH:mm', { locale: dateLocale })}
                </Text>
              </Box>
            </HStack>

            <Box className="h-[1px] w-full bg-white opacity-10" />

            <HStack className="justify-between items-center">
              <HStack space="sm" className="items-center">
                <Box className="w-2 h-2 relative items-center justify-center">
                  <Box className="absolute w-2 h-2 rounded-full bg-success-400 opacity-75" />
                  <Box className="w-2 h-2 rounded-full bg-success-500" />
                </Box>
                <Text size="sm" className="text-typography-400 font-medium">
                  {shift.shiftType?.name || 'Main Rotation'}
                </Text>
              </HStack>
              <Box className="bg-white/5 border border-white/5 px-3 py-1 rounded-md">
                <Text size="sm" className="text-typography-300 font-bold uppercase">
                  {format(displayDate, 'dd MMM', { locale: dateLocale })}
                </Text>
              </Box>
            </HStack>
          </VStack>
        </Box>
      </Box>
    );
  };

  const renderNextShiftCard = (shift: ShiftWithRelations) => {
    const displayDate = parseShiftCarouselDisplayDate({ shiftDate: shift.date, startsAt: shift.startsAt });

    return (
      <Box
        key={shift.id}
        className="rounded-[32px] overflow-hidden bg-black/20 border border-white/5 opacity-70"
        style={{ width: CARD_WIDTH, marginLeft: 16 }}
      >
        <Box className="p-6">
          <HStack className="justify-between items-center mb-6">
            <HStack space="md" className="items-center">
              <Box className="w-10 h-10 rounded-xl bg-white/5 items-center justify-center border border-white/5">
                <CalendarClock size={20} color="#737373" />
              </Box>
              <VStack>
                <Text size="md" className="text-typography-300 font-semibold">
                  {t('shift.upcomingTitle')}
                </Text>
              </VStack>
            </HStack>
            {/* <Box
              bg="rgba(255, 255, 255, 0.05)"
              borderColor="rgba(255, 255, 255, 0.05)"
              borderWidth={1}
              px="$3"
              py="$1"
              rounded="$full"
            >
              <Text color="$textDark500" size="sm" fontWeight="$bold" textTransform="uppercase" letterSpacing={2}>
                {t('shift.upcomingStatus')}
              </Text>
            </Box> */}
          </HStack>

          <VStack space="md">
            <HStack space="md" className="items-center">
              <Box className="flex-1">
                <Text size="xs" className="text-typography-600 uppercase tracking-[1.5px] mb-1">
                  {t('shift.station')}
                </Text>
                <HStack space="xs" className="items-center">
                  <MapPin size={14} color="#525252" />
                  <Text size="md" className="text-typography-500 font-medium">
                    {shift.site?.name || t('shift.defaultLocation')}
                  </Text>
                </HStack>
              </Box>
              <Box className="flex-1 items-flex-end">
                <Text size="xs" className="text-typography-600 uppercase tracking-[1.5px] mb-1">
                  {t('shift.timeframe')}
                </Text>
                <Text size="md" className="text-typography-300 font-medium tracking-[0.5px]">
                  {format(new Date(shift.startsAt), 'HH:mm', { locale: dateLocale })} —{' '}
                  {format(new Date(shift.endsAt), 'HH:mm', { locale: dateLocale })}
                </Text>
              </Box>
            </HStack>

            <Box className="h-[1px] w-full bg-white/5" />

            <HStack className="justify-between items-center">
              <HStack space="sm" className="items-center">
                <Box className="w-2 h-2 relative items-center justify-center">
                  <Box className="absolute w-1.5 h-1.5 rounded-full bg-slate-600 opacity-50" />
                </Box>
                <Text size="sm" className="text-typography-400 font-medium">
                  {shift.shiftType?.name || 'Main Rotation'}
                </Text>
              </HStack>

              <Text size="sm" className="text-typography-500 font-bold uppercase">
                {format(displayDate, 'dd MMM yyyy', { locale: dateLocale })}
              </Text>
            </HStack>
          </VStack>
        </Box>
      </Box>
    );
  };

  if (totalShifts === 0) {
    return null;
  }

  return (
    <Box>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToOffsets={Array.from({ length: totalShifts }).map((_, i) => i * (CARD_WIDTH + 32))}
        snapToAlignment="center"
        disableIntervalMomentum={true}
        contentContainerStyle={{ paddingHorizontal: 24 }}
      >
        {activeShift && renderActiveShiftCard(activeShift)}
        {nextShifts.map(shift => renderNextShiftCard(shift))}
      </ScrollView>

      {totalShifts > 1 && (
        <HStack space="xs" className="justify-center mt-4">
          {Array.from({ length: totalShifts }).map((_, i) => (
            <Box
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i === activeIndex ? 'bg-brand-500' : 'bg-white/10'}`}
              style={{
                // @ts-ignore
                boxShadow: i === activeIndex ? '0 0 8px rgba(217, 35, 35, 0.4)' : 'none',
              }}
            />
          ))}
        </HStack>
      )}
    </Box>
  );
}
