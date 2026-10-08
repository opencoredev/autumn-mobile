import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { UserSchema, type SessionResponse, type User } from "@autumn/shared";
import { api, onUnauthorized, setSessionToken } from "./api";
import { signOutOfGoogle } from "./google-sign-in";
import { unregisterPush } from "./notifications";
import { persister, queryClient } from "./query";
import { secureStorage } from "./secure-storage";

const TOKEN_KEY = "autumn-dashboard.session";
const USER_KEY = "autumn-dashboard.user";

type AuthState =
  | { readonly kind: "loading" }
  | { readonly kind: "signedOut" }
  | { readonly kind: "signedIn"; readonly user: User };

type AuthContextValue = {
  readonly state: AuthState;
  readonly completeSignIn: (session: SessionResponse) => Promise<void>;
  readonly signOut: () => Promise<void>;
};

/** Clears react-query in memory and its AsyncStorage copy, so nothing survives a sign-out. */
async function dropCachedData(): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
  await persister.removeClient();
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseStoredUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed = UserSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  const clearLocal = useCallback(async () => {
    setSessionToken(null);
    await Promise.all([
      secureStorage.remove(TOKEN_KEY),
      secureStorage.remove(USER_KEY),
      dropCachedData(),
    ]);
    setState({ kind: "signedOut" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [token, rawUser] = await Promise.all([
        secureStorage.get(TOKEN_KEY),
        secureStorage.get(USER_KEY),
      ]);
      const user = parseStoredUser(rawUser);
      if (cancelled) return;
      if (token && user) {
        setSessionToken(token);
        setState({ kind: "signedIn", user });
      } else {
        setState({ kind: "signedOut" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onUnauthorized(() => void clearLocal());
    return () => onUnauthorized(null);
  }, [clearLocal]);

  const completeSignIn = useCallback(async (session: SessionResponse) => {
    // Never let one account start from another account's cached screens.
    await dropCachedData();
    setSessionToken(session.token);
    await Promise.all([
      secureStorage.set(TOKEN_KEY, session.token),
      secureStorage.set(USER_KEY, JSON.stringify(session.user)),
    ]);
    setState({ kind: "signedIn", user: session.user });
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush();
    await signOutOfGoogle();
    await api.signOut().catch(() => undefined);
    await clearLocal();
  }, [clearLocal]);

  const value = useMemo(
    () => ({ state, completeSignIn, signOut }),
    [state, completeSignIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
