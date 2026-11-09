import { Pressable, StyleSheet, Text } from 'react-native';

// A short request blocks interaction without briefly recoloring every control.
// Permanent constraints (e.g. quantity one) still have a disabled appearance.
export function ListActionButton({ title, accessibilityLabel, color = '#007aff', disabled = false, busy = false, onPress }: {
  title: string; accessibilityLabel?: string; color?: string; disabled?: boolean; busy?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
    accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
    onPress={onPress} style={({ pressed }) => [styles.button, pressed && !disabled && !busy && styles.pressed]}>
    <Text style={[styles.text, { color: disabled ? '#718078' : color }]}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center', borderRadius: 4 },
  pressed: { backgroundColor: '#e8f1ed' },
  text: { textAlign: 'center', margin: 8, fontSize: 18 },
});
