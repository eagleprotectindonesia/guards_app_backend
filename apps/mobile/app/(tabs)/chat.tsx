import React from 'react';
import { ScrollView } from 'react-native';
import { Box, VStack, Heading, Text, Center, Avatar, AvatarFallbackText, HStack } from '@gluestack-ui/themed';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DUMMY_CHATS = [
  { id: 1, name: 'Admin HQ', lastMessage: 'Please confirm your shift start.', time: '10:30 AM' },
  { id: 2, name: 'Supervisor Budi', lastMessage: 'Good job on the last check-in.', time: 'Yesterday' },
  { id: 3, name: 'Shift Coordination', lastMessage: 'New schedule is out.', time: 'Monday' },
];

export default function ChatScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Box className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 60,
          paddingBottom: 20,
        }}
      >
        <VStack space="xl">
          <Heading size="2xl">{t('chat.title', 'Messages')}</Heading>

          <VStack space="md">
            {DUMMY_CHATS.map(chat => (
              <Box key={chat.id} className="bg-white p-4 rounded-xl shadow-sm">
                <HStack space="md" alignItems="center">
                  <Avatar size="md" bgColor="$blue600">
                    <AvatarFallbackText>{chat.name}</AvatarFallbackText>
                  </Avatar>
                  <VStack className="flex-1">
                    <HStack justifyContent="space-between">
                      <Text className="font-bold text-gray-900">{chat.name}</Text>
                      <Text className="text-xs text-gray-400">{chat.time}</Text>
                    </HStack>
                    <Text className="text-sm text-gray-500" numberOfLines={1}>
                      {chat.lastMessage}
                    </Text>
                  </VStack>
                </HStack>
              </Box>
            ))}
          </VStack>

          {DUMMY_CHATS.length === 0 && (
            <Center h={300}>
              <MessageSquare size={48} stroke="#D1D5DB" />
              <Text className="text-gray-400 mt-4">{t('chat.noMessages', 'No messages yet')}</Text>
            </Center>
          )}
        </VStack>
      </ScrollView>
    </Box>
  );
}
