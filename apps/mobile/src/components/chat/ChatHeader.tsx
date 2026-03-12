import React from 'react';
import { View, StyleSheet } from 'react-native';
import { VStack } from '@/components/ui/vstack';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { BlurView } from 'expo-blur';

type ChatHeaderProps = {
  topInset: number;
  title: string;
  statusText: string;
};

export function ChatHeader({ topInset, title, statusText }: ChatHeaderProps) {
  return (
    <BlurView intensity={40} tint="dark" style={{ paddingTop: topInset }}>
      <HStack className="px-4 py-3 items-center justify-between">
        <HStack space="md" className="items-center">
          <View style={styles.headerLogo}>
            <Text style={styles.headerLogoText}>E</Text>
          </View>
          <VStack>
            <Heading size="md" className="text-white">
              {title}
            </Heading>
            <HStack space="xs" className="items-center">
              <View style={styles.statusDot} />
              <Text size="xs" className="text-emerald-500 font-bold">
                {statusText}
              </Text>
            </HStack>
          </VStack>
        </HStack>
      </HStack>
      <View style={styles.headerDivider} />
    </BlurView>
  );
}

const styles = StyleSheet.create({
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#991B1B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerLogoText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: 8,
  },
});
