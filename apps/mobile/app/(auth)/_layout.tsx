import { Stack } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';

export default function AuthLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
