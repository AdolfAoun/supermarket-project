import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Button, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from './AuthProvider';
import { ui } from './CatalogUI';
import { ListActionButton } from './ListActionButton';

export const inputStyle = StyleSheet.create({ input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#71857a', borderRadius: 8,
  padding: 12, fontSize: 16, color: '#163e32', minHeight: 44 } }).input;
export function ConfirmationNotice({ message }: { message: string | null }) {
  return message ? <View pointerEvents="none" testID="product-add-confirmation" style={{ position: 'absolute', top: 12, left: 20, right: 20,
    zIndex: 10, borderRadius: 8, padding: 12, backgroundColor: '#dcefe5', borderWidth: 1, borderColor: '#88ad99' }}>
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
  return message ? <Text accessibilityRole="alert" style={ui.text}>{message}</Text> : null;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const { state, session } = useAuth();
  if (state.status === 'authenticated') return <View key={state.version} style={{ flex: 1 }}>{children}</View>;
  return <AccountPage>
    <Text style={ui.heading}>Your private shopping lists</Text>
    {state.status === 'guest' && <ErrorText message={state.message} />}
    {state.status === 'restoring' || state.status === 'authenticating' ? <><ActivityIndicator /><Text style={ui.text}>Checking your session…</Text></>
      : <><Text style={ui.text}>{state.status === 'restore_error' ? state.message : 'Log in or register to save lists and compare baskets. You can keep browsing products as a guest.'}</Text>
        {state.status === 'restore_error' ? <Button title="Retry session" onPress={() => void session.restore()} /> : null}
        <Button title="Log in / Register" onPress={() => router.navigate('/(tabs)/profile')} />
        <Button title="Browse products" onPress={() => router.navigate('/(tabs)/explore')} />
      </>}
  </AccountPage>;
}
export function NameForm({ label, initial = '', disabled, submitDisabled = false, submitBusy, onSubmit }: {
  label: string; initial?: string; disabled?: boolean; submitDisabled?: boolean; submitBusy?: boolean; onSubmit: (value: string) => void;
}) {
  const [name, setName] = useState(initial);
  return <View style={ui.card}>
    <Text style={ui.heading}>{label}</Text>
    <TextInput accessibilityLabel={label} style={inputStyle} value={name} onChangeText={setName} maxLength={120} editable={!disabled} />
    {submitBusy === undefined
      ? <Button title={label} disabled={disabled || submitDisabled || !name.trim()} onPress={() => onSubmit(name.trim())} />
      : <ListActionButton title={label} disabled={submitDisabled || !name.trim()} busy={submitBusy} onPress={() => onSubmit(name.trim())} />}
  </View>;
}
