import React, { useRef, useState } from 'react';
import { ScrollView, Dimensions, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Box, VStack, Heading, Text, HStack } from '@gluestack-ui/themed';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40; // Full width minus padding

interface ShiftCarouselProps {
  activeShift: ShiftWithRelations | null | undefined;
  nextShifts: ShiftWithRelations[];
}

export default function ShiftCarousel({ activeShift, nextShifts }: ShiftCarouselProps) {
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

  const renderShiftCard = (shift: ShiftWithRelations, isActive: boolean) => {
    const cardContent = (
      <VStack space="md">
        <HStack justifyContent="space-between" alignItems="center">
          <Heading size="lg" color={isActive ? '$blue900' : '$textLight800'} fontWeight="$bold">
            {isActive ? t('shift.currentTitle') : t('shift.upcomingTitle')}
          </Heading>
          <Box bg={isActive ? '$blue600' : '$backgroundLight200'} px="$3" py="$1" rounded="$full" softShadow="1">
            <Text color={isActive ? '$white' : '$textLight600'} fontWeight="$bold">
              {isActive ? t('shift.activeStatus') : t('shift.upcomingStatus')}
            </Text>
          </Box>
        </HStack>

        <Box>
          <Text color={isActive ? '$blue950' : '$textLight800'} fontWeight="$bold" size="xl" lineHeight="$lg">
            {shift.site?.name || t('shift.defaultLocation')}
          </Text>
          <Text color={isActive ? '$blue800' : '$textLight600'} mt="$2" fontWeight="$semibold">
            {format(new Date(shift.startsAt), 'dd MMM yyyy, HH:mm', { locale: dateLocale })} -{' '}
            {format(new Date(shift.endsAt), 'HH:mm', { locale: dateLocale })}
          </Text>
        </Box>

        {shift.shiftType && (
          <Text size="sm" color={isActive ? '$blue700' : '$textLight500'} fontWeight="$medium">
            {t('shift.typePrefix')}{shift.shiftType.name}
          </Text>
        )}
      </VStack>
    );

    return (
      <Box
        key={shift.id}
        style={{ 
          width: CARD_WIDTH,
          shadowColor: isActive ? '#2563EB' : '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isActive ? 0.2 : 0.1,
          shadowRadius: 12,
          elevation: isActive ? 6 : 4,
        }}
        mr="$4" rounded="$3xl" overflow="hidden" borderWidth={1} borderColor="$blue100"
      >
        {isActive ? (
          <LinearGradient
            colors={['#E0F2FE', '#DBEAFE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 24, flex: 1 }}
          >
            {cardContent}
          </LinearGradient>
        ) : (
          <Box bg="$white" p="$6" flex={1}>
            {cardContent}
          </Box>
        )}
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
        <HStack space="xs" justifyContent="center" mt="$4">
          {Array.from({ length: totalShifts }).map((_, i) => (
            <Box key={i} h="$2" rounded="$full" bg={i === activeIndex ? '$blue600' : '$blue200'} w={i === activeIndex ? '$4' : '$2'} />
          ))}
        </HStack>
      )}
    </Box>
  );
}
