import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createSession } from '../services/session';
import { tokenStorage } from '../services/token-storage';
import { createListApi } from '../services/account-api';

function createAccount() {
  const session = createSession(tokenStorage);
  return { session, lists: createListApi(session.run) };
}
const Context = createContext<ReturnType<typeof createAccount> | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account] = useState(createAccount);
  useEffect(() => { void account.session.restore(); }, [account]);
  return <Context.Provider value={account}>{children}</Context.Provider>;
}
export function useAuth() {
  const account = useContext(Context);
  if (!account) throw new Error('AuthProvider is required');
  const state = useSyncExternalStore(account.session.subscribe, account.session.getState, account.session.getState);
  return { ...account, state };
}
