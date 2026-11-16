import { useState, type ReactNode, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ButtonProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// Light appearance matches app.json. Materials are cross-platform approximations,
// not native Liquid Glass; no blur/native module or development build is needed.
export const colors = {
  background: '#F5F5F0', surface: '#FFFFFF', secondary: '#EEF1EB', ink: '#202D28',
  muted: '#58665F', tertiary: '#68756E', accent: '#226345', accentSoft: '#E9F3EB',
  success: '#226345', warning: '#77531C', warningSoft: '#FAF2E2', error: '#A23B37',
  errorSoft: '#FBEFEB', border: '#DDE4DC', disabled: '#E8ECE6', interactive: '#E3EDE4',
};
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 };
export const radius = { small: 12, card: 20, large: 28 };
export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color = colors.accent }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} accessible={false} />;
}

export function Button({ title, onPress, disabled, accessibilityLabel, color, testID, variant = 'secondary', selected = false }: ButtonProps & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; selected?: boolean;
}) {
  const primary = variant === 'primary' || selected;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
    accessibilityState={{ disabled: !!disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, primary ? styles.primary : variant === 'quiet' ? styles.quiet : styles.secondary,
      variant === 'danger' && styles.danger, disabled && !selected && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, { color: primary ? '#FFFFFF' : variant === 'danger' ? colors.error : color ?? colors.accent },
      disabled && !selected && { color: colors.tertiary }]}>{title}</Text>
  </Pressable>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' }) {
  return <View style={[styles.badge, { backgroundColor: tone === 'success' ? colors.accentSoft : tone === 'warning' ? colors.warningSoft : colors.secondary }]}>
    <Text style={[styles.badgeText, { color: tone === 'warning' ? colors.warning : tone === 'success' ? colors.accent : colors.muted }]}>{children}</Text>
  </View>;
}
export function SectionHeader({ title, eyebrow, detail }: { title: string; eyebrow?: string; detail?: string }) {
  return <View style={styles.section}>{eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
    <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
    {detail && <Text style={styles.body}>{detail}</Text>}
  </View>;
}
export function EmptyState({ title, description, icon = 'basket-outline' }: { title: string; description: string; icon?: IconName }) {
  return <View style={styles.empty}><View style={styles.iconTile}><Icon name={icon} size={28} /></View>
    <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text><Text style={[styles.body, { textAlign: 'center' }]}>{description}</Text>
  </View>;
}
export function Callout({ children, title, tone = 'info' }: { children: ReactNode; title?: string; tone?: 'info' | 'warning' | 'error' }) {
  return <View style={[styles.callout, tone === 'warning' && { backgroundColor: colors.warningSoft }, tone === 'error' && { backgroundColor: colors.errorSoft }]}>
    <View style={styles.calloutHeading}><Icon name={tone === 'error' ? 'alert-circle-outline' : 'information-circle-outline'} size={19}
      color={tone === 'error' ? colors.error : tone === 'warning' ? colors.warning : colors.muted} />
      {title && <Text style={styles.label}>{title}</Text>}</View>{children}
  </View>;
}
export function Disclosure({ title, children, initiallyOpen = false }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <View style={styles.disclosure}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.disclosureButton}>
      <Text style={[styles.label, { flex: 1 }]}>{title}</Text><Icon name={open ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} />
    </Pressable>{open && <View style={styles.disclosureContent}>{children}</View>}
  </View>;
}
export function LoadingState() {
  return <View style={styles.callout} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />
    <Text style={[styles.body, { textAlign: 'center' }]}>Loading…</Text></View>;
}
export const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: radius.small, paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 1 },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderColor: colors.border },
  quiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: colors.errorSoft, borderColor: '#EBCFCA' },
  disabled: { backgroundColor: colors.disabled, borderColor: colors.disabled },
  pressed: { opacity: 0.78 }, buttonText: { fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 21 },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, flexShrink: 1 },
  badgeText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  section: { gap: 6, marginTop: 8, marginBottom: 4 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, fontWeight: '700', color: colors.accent, textTransform: 'uppercase' },
  sectionTitle: { fontSize: 23, lineHeight: 30, letterSpacing: -0.5, fontWeight: '700', color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.muted },
  label: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.ink },
  iconTile: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accentSoft, justifyContent: 'center', alignItems: 'center' },
  empty: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 28, gap: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  callout: { backgroundColor: colors.secondary, borderRadius: 16, padding: 16, gap: 8 },
  calloutHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disclosure: { borderTopWidth: 1, borderColor: colors.border, marginTop: 8 },
  disclosureButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  disclosureContent: { gap: 10, paddingBottom: 12 },
});
