import { View } from 'react-native';

import { Text } from '@/ui/Text';

export default function Placeholder() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text tone="muted">Coming next</Text>
    </View>
  );
}
