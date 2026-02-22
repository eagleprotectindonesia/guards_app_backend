import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { useAlert } from '../contexts/AlertContext';

export function useUpdates() {
  const { showAlert } = useAlert();
  useEffect(() => {
    if (__DEV__) return;

    async function onFetchUpdateAsync() {
      try {
        const update = await Updates.checkForUpdateAsync();

        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          showAlert(
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
  }, [showAlert]);
}
