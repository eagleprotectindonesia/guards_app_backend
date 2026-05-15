import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { BlurView } from 'expo-blur';
import { ChevronLeft, Search, PlusCircle, MoreVertical } from 'lucide-react-native';

type ChatHeaderProps = {
  topInset: number;
  title: string;
  statusText: string;
  onBackPress?: () => void;
  onSearchPress?: () => void;
  onNewChatPress?: () => void;
  onMorePress?: () => void;
};

export function ChatHeader({ 
  topInset, 
  title, 
  statusText, 
  onBackPress,
  onSearchPress,
  onNewChatPress,
  onMorePress
}: ChatHeaderProps) {
  return (
    <BlurView intensity={80} tint="dark" style={{ paddingTop: topInset }}>
      <HStack className="px-5 py-4 items-center justify-between">
        <HStack space="md" className="items-center flex-1">
          {onBackPress ? (
            <Pressable onPress={onBackPress} style={styles.iconButton} hitSlop={12}>
              <ChevronLeft size={22} color="#F8FAFC" />
            </Pressable>
          ) : (
            <View style={styles.headerLogo}>
              <Text style={styles.headerLogoText}>E</Text>
            </View>
          )}
          
          <VStack>
            <Heading size="lg" style={styles.titleText}>
              {title}
            </Heading>
            <HStack space="xs" className="items-center">
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                {statusText}
              </Text>
            </HStack>
          </VStack>
        </HStack>

        <HStack space="lg" className="items-center">
          {onSearchPress && (
            <Pressable onPress={onSearchPress} style={styles.actionIcon} hitSlop={12}>
              <Search size={22} color="#94A3B8" />
            </Pressable>
          )}
          {onNewChatPress && (
            <Pressable onPress={onNewChatPress} style={styles.actionIcon} hitSlop={12}>
              <PlusCircle size={22} color="#3B82F6" />
            </Pressable>
          )}
          {onMorePress && (
            <Pressable onPress={onMorePress} style={styles.actionIcon} hitSlop={12}>
              <MoreVertical size={22} color="#94A3B8" />
            </Pressable>
          )}
        </HStack>
      </HStack>
      <View style={styles.headerDivider} />
    </BlurView>
  );
}

const styles = StyleSheet.create({
  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#991B1B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  headerLogoText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionIcon: {
    padding: 2,
  },
  titleText: {
    color: '#F8FAFC',
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statusText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
    letterSpacing: 0.5,
    opacity: 0.9,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
  },
});
