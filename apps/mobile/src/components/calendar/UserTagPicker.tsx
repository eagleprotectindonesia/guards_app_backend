import { useState, useCallback } from 'react';
import { FlatList, View, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Input, InputField } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import { X, Search, User, Shield } from 'lucide-react-native';
import { useUserSearch, TaggedUserResult } from '../../hooks/useCalendar';

function debounce<T extends (...args: string[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

interface UserTagPickerProps {
  selectedUsers: TaggedUserResult[];
  onChange: (users: TaggedUserResult[]) => void;
}

export function UserTagPicker({ selectedUsers, onChange }: UserTagPickerProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { data, isLoading } = useUserSearch(debouncedQuery);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((q: string) => setDebouncedQuery(q), 300),
    []
  );

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    debouncedSearch(q);
  };

  const isSelected = (id: string) => selectedUsers.some((u) => u.id === id);

  const toggleUser = (user: TaggedUserResult) => {
    if (isSelected(user.id)) {
      onChange(selectedUsers.filter((u) => u.id !== user.id));
    } else {
      onChange([...selectedUsers, user]);
    }
  };

  const removeUser = (userId: string) => {
    onChange(selectedUsers.filter((u) => u.id !== userId));
  };

  const results = data?.users ?? [];

  return (
    <VStack space="sm">
      {/* Selected users chips */}
      {selectedUsers.length > 0 && (
        <HStack className="flex-wrap gap-2">
          {selectedUsers.map((user) => (
            <View key={user.id} className="bg-[#3A3A3C] rounded-full flex-row items-center px-3 py-1.5">
              <Text className="text-white text-xs mr-1.5">{user.name}</Text>
              <Pressable onPress={() => removeUser(user.id)} hitSlop={8}>
                <X size={14} color="#A0A0A0" />
              </Pressable>
            </View>
          ))}
        </HStack>
      )}

      {/* Search input */}
      <Input className="bg-[#2C2C2E] border-0 rounded-xl">
        <InputField
          className="text-white"
          placeholder={t('calendar.searchUsers', 'Search users...')}
          placeholderTextColor="#737373"
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </Input>

      {/* Search results */}
      {isLoading && (
        <ActivityIndicator color="#FF3B30" className="py-4" />
      )}

      {!isLoading && searchQuery.length >= 2 && results.length === 0 && (
        <Text className="text-[#737373] text-sm text-center py-4">
          {t('calendar.noUsersFound', 'No users found')}
        </Text>
      )}

      {results.length > 0 && (
        <View className="bg-[#1C1C1E] rounded-xl overflow-hidden" style={{ maxHeight: 200 }}>
          <FlatList
            data={results}
            keyExtractor={(item) => `${item.type}:${item.id}`}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => toggleUser(item)}
                className="px-4 py-3 border-b border-white/5 flex-row items-center"
              >
                <Box className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${isSelected(item.id) ? 'bg-brand-600/30' : 'bg-[#2C2C2E]'}`}>
                  {item.type === 'admin' ? (
                    <Shield size={16} color={isSelected(item.id) ? '#FF3B30' : '#A0A0A0'} />
                  ) : (
                    <User size={16} color={isSelected(item.id) ? '#FF3B30' : '#A0A0A0'} />
                  )}
                </Box>
                <VStack className="flex-1">
                  <Text className={`text-sm font-medium ${isSelected(item.id) ? 'text-brand-500' : 'text-white'}`}>
                    {item.name}
                  </Text>
                  <Text className="text-xs text-[#737373]">
                    {item.type === 'admin' ? t('calendar.adminTag', 'Admin') : t('calendar.employeeTag', 'Employee')}
                    {item.employeeNumber ? ` · ${item.employeeNumber}` : ''}
                  </Text>
                </VStack>
                {isSelected(item.id) && (
                  <Box className="w-5 h-5 rounded-full bg-brand-600 items-center justify-center">
                    <Text className="text-white text-xs font-bold">✓</Text>
                  </Box>
                )}
              </Pressable>
            )}
          />
        </View>
      )}
    </VStack>
  );
}
