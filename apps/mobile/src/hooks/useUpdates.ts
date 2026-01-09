import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Alert } from 'react-native';

export function useUpdates() {
  useEffect(() => {
    if (__DEV__) return;

    async function onFetchUpdateAsync() {
      try {
        const update = await Updates.checkForUpdateAsync();

        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          Alert.alert(
            'Update Available',
            'A new version of the app is available. The app will restart to apply the update.',
            [
              {
                text: 'Restart Now',
                onPress: async () => {
                  await Updates.reloadAsync();
                },
              },
            ]
          );
        }
      } catch (error) {
        // You can also add an error handler here
        console.error(`Error fetching latest Expo update: ${error}`);
      }
    }

    onFetchUpdateAsync();
  }, []);
}
