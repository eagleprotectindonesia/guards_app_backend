import React from 'react';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import { Star, MapPin, Clock } from 'lucide-react-native';
import { format } from 'date-fns';
import { ShiftWithRelations } from '@repo/types';

interface EventInfoCardProps {
  shift: ShiftWithRelations;
  eventType: string;
  eventName: string;
}

export default function EventInfoCard({ shift, eventType, eventName }: EventInfoCardProps) {
  return (
    <Box className="rounded-[32px] overflow-hidden bg-background-900 border border-outline-800 relative p-6">
      <VStack space="md">
        <HStack space="md" className="items-center">
          <Box className="w-10 h-10 rounded-xl bg-warning-500/15 items-center justify-center border border-warning-500/30">
            <Star size={20} color="#F59E0B" />
          </Box>
          <VStack>
            <Text size="xs" className="text-typography-500 uppercase tracking-[1.5px] font-semibold">
              Event Shift
            </Text>
            <Heading size="sm" className="text-white font-bold">
              {eventName}
            </Heading>
          </VStack>
        </HStack>

        <Box className="bg-warning-500/15 border border-warning-500/30 px-3 py-1.5 rounded-full self-start">
          <Text size="sm" className="text-warning-500 font-bold uppercase tracking-[1px]">
            {eventType}
          </Text>
        </Box>

        <Box className="h-[1px] w-full bg-white/10" />

        <HStack space="sm" className="items-start">
          <MapPin size={16} color="#F59E0B" style={{ marginTop: 2 }} />
          <Text size="sm" className="text-typography-300 flex-1">
            {shift.site?.address || shift.site?.name || 'No location'}
          </Text>
        </HStack>

        <HStack space="sm" className="items-center">
          <Clock size={16} color="#737373" />
          <Text size="sm" className="text-typography-400">
            {format(new Date(shift.startsAt), 'HH:mm')} — {format(new Date(shift.endsAt), 'HH:mm')}
          </Text>
        </HStack>
      </VStack>
    </Box>
  );
}
