import React, { useRef, useState } from 'react';
import { ScrollView, Dimensions, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Box, VStack, Text, HStack } from '@gluestack-ui/themed';
import { format } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { ShiftWithRelations } from '@repo/types';
import { CalendarCheck, MapPin, CalendarClock } from 'lucide-react-native';
import { useSettings } from '../hooks/useSettings';

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
    return (
      <Box
        key={shift.id}
        w={CARD_WIDTH}
        mr="$4"
        rounded="$3xl"
        overflow="hidden"
        bg="$backgroundDark900"
        borderColor="$borderDark800"
        borderWidth={1}
        position="relative"
      >
        {/* Red Glow Effect */}
        <Box
          position="absolute"
          top={0}
          right={0}
          w={128}
          h={128}
          bg="$red500"
          opacity={0.03}
          rounded="$full"
          sx={{
            '@base': {
              _transform: [{ translateX: 30 }, { translateY: -30 }],
            },
          }}
        />

        {/* Left Border Gradient Effect (Mocked with Box) */}
        <Box position="absolute" left={0} top={0} bottom={0} w={2} bg="$red600" opacity={0.5} />

        <Box p="$6">
          {/* Header */}
          <HStack justifyContent="space-between" alignItems="center" mb="$6">
            <HStack space="md" alignItems="center">
              <Box
                w="$8"
                h="$8"
                rounded="$xl"
                bg="$backgroundDark800"
                alignItems="center"
                justifyContent="center"
                borderColor="$borderDark700"
                borderWidth={1}
              >
                <CalendarCheck size={16} color="#D92323" />
              </Box>
              <VStack>
                <Text color="$white" fontWeight="$medium" size="sm">
                  {t('shift.currentTitle')}
                </Text>
              </VStack>
            </HStack>
            <Box
              bg="rgba(217, 35, 35, 0.15)"
              borderColor="rgba(217, 35, 35, 0.3)"
              borderWidth={1}
              px="$3"
              py="$1.5"
              rounded="$full"
            >
              <Text color="$red500" size="sm" fontWeight="$extrabold" textTransform="uppercase" letterSpacing={2}>
                {t('shift.activeStatus')}
              </Text>
            </Box>
          </HStack>

          {/* Details */}
          <VStack space="md">
            <HStack space="md" alignItems="center">
              <Box flex={1}>
                <Text
                  color="$textDark500"
                  size="sm"
                  textTransform="uppercase"
                  letterSpacing={1.5}
                  mb="$1.5"
                  fontWeight="$semibold"
                >
                  {t('shift.station')}
                </Text>
                <HStack space="xs" alignItems="center">
                  <MapPin size={14} color="#D92323" />
                  <Text color="$textDark200" size="md" fontWeight="$medium">
                    {shift.site?.name || t('shift.defaultLocation')}
                  </Text>
                </HStack>
              </Box>
              <Box flex={1} alignItems="flex-end">
                <Text
                  color="$textDark500"
                  size="sm"
                  textTransform="uppercase"
                  letterSpacing={1.5}
                  mb="$1.5"
                  fontWeight="$semibold"
                >
                  {t('shift.timeframe')}
                </Text>
                <Text color="$white" size="md" fontWeight="$medium" letterSpacing={0.5}>
                  {format(new Date(shift.startsAt), 'HH:mm', { locale: dateLocale })} —{' '}
                  {format(new Date(shift.endsAt), 'HH:mm', { locale: dateLocale })}
                </Text>
              </Box>
            </HStack>

            <Box h={1} w="$full" bg="$white" opacity={0.1} />

            <HStack justifyContent="space-between" alignItems="center">
              <HStack space="sm" alignItems="center">
                <Box w={8} h={8} position="relative" alignItems="center" justifyContent="center">
                  <Box position="absolute" w={8} h={8} rounded="$full" bg="$green400" opacity={0.75} />
                  <Box w={8} h={8} rounded="$full" bg="$green500" />
                </Box>
                <Text color="$textDark400" size="sm" fontWeight="$medium">
                  {shift.shiftType?.name || 'Main Rotation'}
                </Text>
              </HStack>
              <Box
                bg="rgba(255, 255, 255, 0.05)"
                borderColor="rgba(255, 255, 255, 0.05)"
                borderWidth={1}
                px="$3"
                py="$1"
                rounded="$md"
              >
                <Text color="$textDark300" size="sm" fontWeight="$bold" textTransform="uppercase">
                  {format(new Date(shift.startsAt), 'dd MMM', { locale: dateLocale })}
                </Text>
              </Box>
            </HStack>
          </VStack>
        </Box>
      </Box>
    );
  };

  const renderNextShiftCard = (shift: ShiftWithRelations) => {
    return (
      <Box
        key={shift.id}
        w={CARD_WIDTH}
        ml="$4"
        rounded="$3xl"
        overflow="hidden"
        bg="rgba(0,0,0,0.2)"
        borderColor="rgba(255,255,255,0.05)"
        borderWidth={1}
        opacity={0.7}
      >
        <Box p="$6">
          <HStack justifyContent="space-between" alignItems="center" mb="$6">
            <HStack space="md" alignItems="center">
              <Box
                w="$10"
                h="$10"
                rounded="$xl"
                bg="rgba(255,255,255,0.05)"
                alignItems="center"
                justifyContent="center"
                borderColor="rgba(255,255,255,0.05)"
                borderWidth={1}
              >
                <CalendarClock size={20} color="#737373" />
              </Box>
              <VStack>
                <Text color="$textDark300" fontWeight="$semibold" size="md">
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
            <HStack space="md" alignItems="center">
              <Box flex={1}>
                <Text color="$textDark600" size="sm" textTransform="uppercase" letterSpacing={1.5} mb="$1">
                  {t('shift.station')}
                </Text>
                <HStack space="xs" alignItems="center">
                  <MapPin size={14} color="#525252" />
                  <Text color="$textDark500" size="md" fontWeight="$medium">
                    {shift.site?.name || t('shift.defaultLocation')}
                  </Text>
                </HStack>
              </Box>
              <Box flex={1} alignItems="flex-end">
                <Text color="$textDark600" size="sm" textTransform="uppercase" letterSpacing={1.5} mb="$1">
                  {t('shift.timeframe')}
                </Text>
                <Text color="$textDark300" size="md" fontWeight="$medium" letterSpacing={0.5}>
                  {format(new Date(shift.startsAt), 'HH:mm', { locale: dateLocale })} —{' '}
                  {format(new Date(shift.endsAt), 'HH:mm', { locale: dateLocale })}
                </Text>
              </Box>
            </HStack>

            <Box h={1} w="$full" bg="rgba(255,255,255,0.05)" />

            <HStack justifyContent="space-between" alignItems="center">
              <HStack space="sm" alignItems="center">
                <Box w={8} h={8} position="relative" alignItems="center" justifyContent="center">
                  <Box position="absolute" w={6} h={6} rounded="$full" bg="$blueGray600" opacity={0.5} />
                </Box>
                <Text color="$textDark400" size="sm" fontWeight="$medium">
                  {shift.shiftType?.name || 'Main Rotation'}
                </Text>
              </HStack>

              <Text color="$textDark500" size="sm" fontWeight="$bold" textTransform="uppercase">
                {format(new Date(shift.startsAt), 'dd MMM yyyy', { locale: dateLocale })}
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
        <HStack space="xs" justifyContent="center" mt="$4">
          {Array.from({ length: totalShifts }).map((_, i) => (
            <Box
              key={i}
              w={6}
              h={6}
              rounded="$full"
              bg={i === activeIndex ? '$red500' : 'rgba(255,255,255,0.1)'}
              sx={{
                _web: {
                  boxShadow: i === activeIndex ? '0 0 8px rgba(217, 35, 35, 0.4)' : 'none',
                },
              }}
            />
          ))}
        </HStack>
      )}
    </Box>
  );
}
