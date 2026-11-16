import { Button } from '../../components/Design';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../components/AuthProvider';
import { AccountPage, ErrorText, inputStyle } from '../../components/AccountUI';
import { ui } from '../../components/CatalogUI';
import { useMutation } from '../../hooks/useMutation';
import { Badge, colors, Icon } from '../../components/Design';

function AuthForm() {
  const { session, state } = useAuth();
  const [register, setRegister] = useState(false), [name, setName] = useState('');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [notice, setNotice] = useState<string | null>(null);
  const action = useMutation();
  const pending = action.pending || state.status === 'authenticating';
  const valid = email.trim().includes('@') && [...password].length >= 8 && [...password].length <= 128 && (!register || name.trim().length > 0);
  return <View style={ui.card}>
    <Badge tone="success">YOUR SHOPPING COMPANION</Badge>
    <Icon name={register ? 'person-add-outline' : 'lock-closed-outline'} size={30} />
    <Text style={ui.title}>{register ? 'Create account' : 'Log in'}</Text>
    <Text style={ui.muted}>{register ? 'Make room for a smarter grocery routine.' : 'Welcome back. Your lists are waiting.'}</Text>
    <ErrorText message={notice || state.message} />
    {register && <><Text style={ui.text}>Display name</Text><TextInput accessibilityLabel="Display name" style={inputStyle}
      value={name} onChangeText={setName} maxLength={80} editable={!pending} autoComplete="name" /></>}
    <Text style={ui.text}>Email</Text><TextInput accessibilityLabel="Email" style={inputStyle} value={email} onChangeText={setEmail}
      maxLength={254} editable={!pending} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
    <Text style={ui.text}>Password</Text><TextInput accessibilityLabel="Password" style={inputStyle} value={password} onChangeText={setPassword}
      secureTextEntry editable={!pending} autoCapitalize="none" autoCorrect={false} autoComplete={register ? 'new-password' : 'current-password'} />
    <Text style={ui.muted}>Use 8–128 characters. Passwords are not trimmed.</Text>
    <ErrorText message={action.error} />{pending && <ActivityIndicator />}
    <Button title={register ? 'Register' : 'Log in'} variant="primary" disabled={!valid || pending} onPress={() => {
      setNotice(null);
      void action.run(async signal => {
        if (register) return session.register({ displayName: name.trim(), email: email.trim(), password }, signal);
        await session.login({ email: email.trim(), password }); return null;
      }, user => { setPassword(''); if (user) { setRegister(false); setNotice('Account created. Log in with your email and password.'); } });
    }} />
    <Button title={register ? 'Already registered? Log in' : 'Create an account'} variant="quiet" disabled={pending}
      onPress={() => { setRegister(!register); setPassword(''); setNotice(null); }} />
  </View>;
}
export default function Profile() {
  const { state, session } = useAuth(), action = useMutation();
  return <AccountPage>
    {state.status === 'restoring' ? <><ActivityIndicator /><Text style={ui.text}>Restoring your session…</Text></>
      : state.status === 'restore_error' ? <><ErrorText message={state.message} />
        <Button title="Retry session" onPress={() => void session.restore()} />
        <Button title="Sign out on this device" onPress={() => void action.run(() => session.logout())} disabled={action.pending} /></>
        : state.status === 'authenticated' ? <>
          <View style={ui.card}><View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="person-outline" size={28} /></View>
          <Badge tone="success">SIGNED IN</Badge><Text style={ui.title}>{state.user!.displayName}</Text><Text style={ui.muted}>{state.user!.email}</Text></View>
          <Button title="My shopping lists" variant="primary" onPress={() => router.navigate('/(tabs)/shopping-list')} />
          <Button title="Log out" variant="danger" disabled={action.pending} onPress={() => void action.run(() => session.logout())} />
        </> : <><AuthForm />{state.message && <Button title="Retry sign out" onPress={() => void action.run(() => session.logout())} disabled={action.pending} />}</>}
    <Text style={ui.muted}>Catalog browsing is available without an account. Native sessions persist securely; browser sessions last until the page is closed or reloaded.</Text>
  </AccountPage>;
}
