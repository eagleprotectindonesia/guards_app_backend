import { HStack } from '@/components/ui/hstack';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { useTranslation } from 'react-i18next';

export type CalendarView = 'month' | 'week' | 'day' | 'list';

const VIEWS: CalendarView[] = ['month', 'week', 'day', 'list'];

export function CalendarViewSwitcher({
  activeView,
  onViewChange,
}: {
  activeView: CalendarView;
  onViewChange: (view: CalendarView) => void;
}) {
  const { t } = useTranslation();

  return (
    <HStack className="px-4 py-2" space="xs">
      {VIEWS.map(view => {
        const isActive = view === activeView;
        return (
          <Pressable
            key={view}
            onPress={() => onViewChange(view)}
            className={`flex-1 py-2 rounded-lg ${isActive ? 'bg-[#FF3B30]' : 'bg-[#1A1A1A]'}`}
          >
            <Text className={`text-center font-semibold text-xs ${isActive ? 'text-white' : 'text-[#737373]'}`}>
              {t(`calendar.${view}View`, view.charAt(0).toUpperCase() + view.slice(1))}
            </Text>
          </Pressable>
        );
      })}
    </HStack>
  );
}
