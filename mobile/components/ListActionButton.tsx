import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from './Design';

// A short request blocks interaction without briefly recoloring every control.
// Permanent constraints (e.g. quantity one) still have a disabled appearance.
export function ListActionButton({ title, accessibilityLabel, color = colors.accent, disabled = false, busy = false, onPress, variant = 'secondary' }: {
  title: string; accessibilityLabel?: string; color?: string; disabled?: boolean; busy?: boolean; onPress: () => void; variant?: 'primary' | 'secondary';
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
    onPress={onPress} style={({ pressed }) => [styles.button, variant === 'primary' && { backgroundColor: colors.accent, borderColor: colors.accent },
      disabled && { backgroundColor: colors.disabled, borderColor: colors.disabled }, pressed && !disabled && !busy && styles.pressed]}>
    <Text style={[styles.text, { color: disabled ? colors.tertiary : variant === 'primary' ? '#FFFFFF' : color }]}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: 48, minWidth: 48, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12 },
  pressed: { opacity: 0.78 },
  text: { textAlign: 'center', marginVertical: 12, fontSize: 15, lineHeight: 21, fontWeight: '600' },
});
