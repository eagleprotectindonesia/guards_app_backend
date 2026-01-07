import React, { useRef, useState } from 'react';
import { ScrollView, Dimensions, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Box, VStack, Heading, Text, Button, ButtonText, HStack } from '@gluestack-ui/themed';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40; // Full width minus padding

interface ShiftCarouselProps {
  activeShift: any;
  nextShifts: any[];
}

export default function ShiftCarousel({ activeShift, nextShifts }: ShiftCarouselProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const totalShifts = (activeShift ? 1 : 0) + nextShifts.length;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / (CARD_WIDTH + 16));
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  const renderShiftCard = (shift: any, isActive: boolean) => {
    return (
      <Box
        key={shift.id}
        style={{ width: CARD_WIDTH }}
        className="bg-blue-50 p-6 rounded-2xl border border-blue-200 mr-4"
      >
        <VStack space="md">
          <HStack justifyContent="space-between" alignItems="center">
            <Heading size="lg" className="text-blue-800">
              {isActive ? 'Shift Sekarang' : 'Shift Mendatang'}
            </Heading>
            <Box className={`${isActive ? 'bg-blue-100' : 'bg-gray-100'} px-2 py-0.5 rounded-full`}>
              <Text className={`text-xs font-bold ${isActive ? 'text-blue-800' : 'text-gray-600'}`}>
                {isActive ? 'AKTIF' : 'MENDATANG'}
              </Text>
            </Box>
          </HStack>

          <Box>
            <Text className="text-gray-700 font-bold text-xl leading-tight">
              {shift.location?.name || shift.site?.name || 'Lokasi'}
            </Text>
            <Text className="text-gray-600 mt-2 font-medium">
              {format(new Date(shift.startsAt), 'dd MMM yyyy, HH:mm', { locale: id })} -{' '}
              {format(new Date(shift.endsAt), 'HH:mm', { locale: id })}
            </Text>
          </Box>

          {shift.shiftType && <Text className="text-sm text-gray-500">Tipe Shift: {shift.shiftType.name}</Text>}
        </VStack>
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
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 16} // card width + margin
        snapToAlignment="start"
        contentContainerStyle={{ paddingRight: 40 }}
      >
        {activeShift && renderShiftCard(activeShift, true)}
        {nextShifts.map(shift => renderShiftCard(shift, false))}
      </ScrollView>

      {totalShifts > 1 && (
        <HStack space="xs" justifyContent="center" className="mt-4">
          {Array.from({ length: totalShifts }).map((_, i) => (
            <Box key={i} className={`h-2 rounded-full ${i === activeIndex ? 'w-4 bg-blue-600' : 'w-2 bg-blue-200'}`} />
          ))}
        </HStack>
      )}
    </Box>
  );
}
