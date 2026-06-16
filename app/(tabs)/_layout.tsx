import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import { TabBar } from '@/components/ui/TabBar';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useI18n } from '@/providers/I18nProvider';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { t } = useI18n();

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tabs.map'),
          tabBarIcon: ({ color, size }) => (
            <SymbolView name={{ ios: 'map.fill', android: 'map', web: 'map' }} tintColor={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="guides"
        options={{
          href: null,
          tabBarItemStyle: { display: 'none' },
          title: t('tabs.guides'),
        }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: t('tabs.family'),
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
              tintColor={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="kit"
        options={{
          href: null,
          tabBarItemStyle: { display: 'none' },
          title: t('tabs.kit'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
              tintColor={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
