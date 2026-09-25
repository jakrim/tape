import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors, fonts } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={colors.bg}
      tintColor={colors.accent}
      iconColor={colors.textFaint}
      indicatorColor={colors.surfaceRaised}
      labelStyle={{ fontFamily: fonts.medium, color: colors.textFaint }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Markets</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="show_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="portfolio">
        <NativeTabs.Trigger.Label>Portfolio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.pie" md="pie_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
