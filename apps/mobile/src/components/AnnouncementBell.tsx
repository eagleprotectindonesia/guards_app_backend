import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Bell } from 'lucide-react-native';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';

type AnnouncementBellProps = {
  count: number;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export default function AnnouncementBell({ count, onPress, accessibilityLabel }: AnnouncementBellProps) {
  const badgeCount = Math.min(count, 9);
  const showBadge = count > 0;

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityLabel={accessibilityLabel}
        className="w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center relative"
      >
        <Bell size={18} color="#FFFFFF" />
        {showBadge ? (
          <Box className="absolute -top-1.5 -right-1.5 min-w-5 h-5 rounded-full bg-[#EF4444] border border-black items-center justify-center px-1">
            <Text size="2xs" className="font-bold text-white leading-none">
              {badgeCount}
            </Text>
          </Box>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <Box
      accessibilityLabel={accessibilityLabel}
      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center relative"
    >
      <Bell size={18} color="#FFFFFF" />
      {showBadge ? (
        <Box className="absolute -top-1.5 -right-1.5 min-w-5 h-5 rounded-full bg-[#EF4444] border border-black items-center justify-center px-1">
          <Text size="2xs" className="font-bold text-white leading-none">
            {badgeCount}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
