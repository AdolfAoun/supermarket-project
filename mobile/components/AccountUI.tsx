import { Button } from './Design';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from './AuthProvider';
import { ui } from './CatalogUI';
import { ListActionButton } from './ListActionButton';
import { colors, Icon } from './Design';

export const inputStyle = StyleSheet.create({ input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#B8C6BC', borderRadius: 12,
  padding: 14, fontSize: 16, color: colors.ink, minHeight: 50 } }).input;
export function ConfirmationNotice({ message }: { message: string | null }) {
  return message ? <View pointerEvents="none" testID="product-add-confirmation" style={{ position: 'absolute', top: 12, left: 20, right: 20,
    zIndex: 10, borderRadius: 16, padding: 16, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: '#88ad99' }}>
    <Text accessibilityLiveRegion="polite" style={ui.text}>{message}</Text>
  </View> : null;
}
export function AccountPage({ children, confirmation = null, testID, nativeKeyboardInsets = false }: {
  children: ReactNode; confirmation?: string | null; testID?: string; nativeKeyboardInsets?: boolean;
}) {
  const [keyboardActive, setKeyboardActive] = useState(false);
  useFocusEffect(useCallback(() => {
    setKeyboardActive(true);
    return () => setKeyboardActive(false);
  }, []));
  const scroll = <ScrollView testID={testID} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled"
    automaticallyAdjustKeyboardInsets={nativeKeyboardInsets}>{children}</ScrollView>;
  return <SafeAreaView style={ui.page} edges={['left', 'right', 'bottom']}>
    {nativeKeyboardInsets ? <View style={{ flex: 1 }}>{scroll}</View>
      : <KeyboardAvoidingView enabled={keyboardActive} style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        {scroll}
      </KeyboardAvoidingView>}
    <ConfirmationNotice message={confirmation} />
  </SafeAreaView>;
}
export function ErrorText({ message }: { message: string | null }) {
  return message ? <View style={{ padding: 14, borderRadius: 12, backgroundColor: colors.errorSoft }}><Text accessibilityRole="alert" style={[ui.text, { color: colors.error }]}>{message}</Text></View> : null;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const { state, session } = useAuth();
  if (state.status === 'authenticated') return <View key={state.version} style={{ flex: 1 }}>{children}</View>;
  return <AccountPage>
    <View style={ui.card}><Icon name="lock-closed-outline" size={28} /><Text style={ui.title}>Your private shopping lists</Text>
    <Text style={ui.muted}>A little planning. Better grocery choices.</Text></View>
    {state.status === 'guest' && <ErrorText message={state.message} />}
    {state.status === 'restoring' || state.status === 'authenticating' ? <><ActivityIndicator /><Text style={ui.text}>Checking your session…</Text></>
      : <><Text style={ui.text}>{state.status === 'restore_error' ? state.message : 'Log in or register to save lists and compare baskets. You can keep browsing products as a guest.'}</Text>
        {state.status === 'restore_error' ? <Button title="Retry session" onPress={() => void session.restore()} /> : null}
        <Button title="Log in / Register" variant="primary" onPress={() => router.navigate('/(tabs)/profile')} />
        <Button title="Browse products" onPress={() => router.navigate('/(tabs)/explore')} />
      </>}
  </AccountPage>;
}
export function NameForm({ label, initial = '', disabled, submitDisabled = false, submitBusy, onSubmit }: {
  label: string; initial?: string; disabled?: boolean; submitDisabled?: boolean; submitBusy?: boolean; onSubmit: (value: string) => void;
}) {
  const [name, setName] = useState(initial);
  return <View style={ui.card}>
    <Text style={ui.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholder="e.g. Weekly groceries" placeholderTextColor={colors.tertiary} style={inputStyle} value={name} onChangeText={setName} maxLength={120} editable={!disabled} />
    {submitBusy === undefined
      ? <Button title={label} variant="primary" disabled={disabled || submitDisabled || !name.trim()} onPress={() => onSubmit(name.trim())} />
      : <ListActionButton title={label} disabled={submitDisabled || !name.trim()} busy={submitBusy} onPress={() => onSubmit(name.trim())} />}
  </View>;
}
