import { useRouter } from 'expo-router';
import { type LucideIcon } from 'lucide-react-native';

import { ListRow } from '@/components/ui/ListRow';
import { IconTile } from '@/components/ui/IconTile';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type QuickActionProps = {
  href: string;
  title: string;
  subtitle?: string;
  /** Leading icon, drawn white inside a color-filled tile. */
  icon: LucideIcon;
  accent?: 'default' | 'alert';
};

/**
 * Quick navigational row on the Home screen. Composes the design-system
 * <ListRow> + <IconTile> primitives so spacing, radius, hairline border, tap
 * target, and chevron all stay consistent with the rest of the app. The tile
 * is brand-blue by default and the alert red for urgent actions.
 */
export function QuickAction({ href, title, subtitle, icon: Icon, accent = 'default' }: QuickActionProps) {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      leading={
        <IconTile color={accent === 'alert' ? colors.alert : colors.brand}>
          <Icon size={18} color={colors.onBrand} />
        </IconTile>
      }
      onPress={() => router.push(href as never)}
    />
  );
}
