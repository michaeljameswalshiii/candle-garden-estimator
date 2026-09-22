import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  attributesToObject,
  confirmSignUp as cognitoConfirm,
  getUser,
  changePassword as cognitoChangePassword,
  confirmForgotPassword as cognitoConfirmForgotPassword,
  deleteUser as cognitoDeleteUser,
  forgotPassword as cognitoForgotPassword,
  globalSignOut,
  refreshSession,
  resendConfirmationCode,
  signIn as cognitoSignIn,
  signUp as cognitoSignUp,
  updateUserAttributes as cognitoUpdateUserAttributes,
} from './cognitoClient';
import { purgeAccountData } from './apiClient';
import {
  clearTokens,
  isSessionExpired,
  loadProfile,
  loadTokens,
  saveProfile,
  saveTokens,
} from './authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const applySession = useCallback(async (sessionTokens) => {
    await saveTokens(sessionTokens);
    const stored = await loadTokens();
    setTokens(stored || sessionTokens);
    const raw = await getUser((stored || sessionTokens).accessToken);
    const profile = attributesToObject(raw);
    await saveProfile(profile);
    setUser(profile);
    return profile;
  }, []);

  const dropSession = useCallback(async () => {
    await clearTokens();
    setTokens(null);
    setUser(null);
  }, []);

  const refreshAndApply = useCallback(async (refreshToken) => {
    const session = await refreshSession(refreshToken);
    await saveTokens(session);
    const stored = await loadTokens();
    setTokens(stored || session);
    return stored || session;
  }, []);

  const restore = useCallback(async () => {
    setBooting(true);
    setError(null);
    try {
      const stored = await loadTokens();
      if (!stored) {
        setUser(null);
        setTokens(null);
        return;
      }

      let session = stored;
      if (isSessionExpired(stored)) {
        if (!stored.refreshToken) {
          await dropSession();
          return;
        }
        session = await refreshAndApply(stored.refreshToken);
      }

      setTokens(session);
      try {
        const raw = await getUser(session.accessToken);
        const profile = attributesToObject(raw);
        await saveProfile(profile);
        setUser(profile);
      } catch {
        if (session.refreshToken) {
          const refreshed = await refreshAndApply(session.refreshToken);
          await applySession(refreshed);
        } else {
          await dropSession();
        }
      }
    } catch (e) {
      await dropSession();
      setError(e.message);
    } finally {
      setBooting(false);
    }
  }, [applySession, dropSession, refreshAndApply]);

  useEffect(() => {
    restore();
  }, [restore]);

  const signUp = useCallback(async ({ email, password, name, phone, address, marketingOptIn }) => {
    setBusy(true);
    setError(null);
    try {
      const result = await cognitoSignUp({ email, password, name, phone, address, marketingOptIn });
      return {
        needsConfirmation: !result.UserConfirmed,
        userSub: result.UserSub,
        email,
      };
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const updateProfile = useCallback(async ({ name, phone, address, marketingOptIn }) => {
    setBusy(true);
    setError(null);
    try {
      const access = tokens?.accessToken || (await loadTokens())?.accessToken;
      if (!access) throw new Error('Not signed in');
      await cognitoUpdateUserAttributes({ accessToken: access, name, phone, address, marketingOptIn });
      const raw = await getUser(access);
      const profile = attributesToObject(raw);
      await saveProfile(profile);
      setUser(profile);
      return profile;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [tokens]);

  const confirmSignUp = useCallback(async ({ email, code }) => {
    setBusy(true);
    setError(null);
    try {
      await cognitoConfirm({ email, code });
      return true;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const resendCode = useCallback(async (email) => {
    setBusy(true);
    setError(null);
    try {
      await resendConfirmationCode({ email });
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    setBusy(true);
    setError(null);
    try {
      const session = await cognitoSignIn({ email, password });
      return await applySession(session);
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [applySession]);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      if (tokens?.accessToken) {
        await globalSignOut(tokens.accessToken);
      }
    } finally {
      await dropSession();
      setBusy(false);
    }
  }, [tokens, dropSession]);

  const deleteAccount = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const access =
        tokens?.accessToken ||
        (await loadTokens())?.accessToken;
      if (!access) {
        throw new Error('Not signed in');
      }
      try {
        await purgeAccountData();
      } catch (purgeErr) {
        console.warn('Account purge warning:', purgeErr?.message);
      }
      await cognitoDeleteUser(access);
      await dropSession();
      return true;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [tokens, dropSession]);

  const forgotPassword = useCallback(async (email) => {
    setBusy(true);
    setError(null);
    try {
      await cognitoForgotPassword({ email: email.trim() });
      return true;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const confirmForgotPassword = useCallback(async ({ email, code, password }) => {
    setBusy(true);
    setError(null);
    try {
      await cognitoConfirmForgotPassword({
        email: email.trim(),
        code: code.trim(),
        password,
      });
      return true;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const changePassword = useCallback(async ({ previousPassword, proposedPassword }) => {
    setBusy(true);
    setError(null);
    try {
      const access =
        tokens?.accessToken ||
        (await loadTokens())?.accessToken;
      if (!access) throw new Error('Not signed in');
      await cognitoChangePassword({
        accessToken: access,
        previousPassword,
        proposedPassword,
      });
      return true;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [tokens]);

  const ensureFreshSession = useCallback(async ({ force = false } = {}) => {
    let session = tokens || (await loadTokens());
    if (!session) return null;

    if (force || isSessionExpired(session)) {
      if (!session.refreshToken) {
        await dropSession();
        return null;
      }
      try {
        session = await refreshAndApply(session.refreshToken);
      } catch {
        await dropSession();
        return null;
      }
    }
    return session;
  }, [tokens, dropSession, refreshAndApply]);

  const getAccessToken = useCallback(async () => {
    const session = await ensureFreshSession();
    return session?.accessToken || null;
  }, [ensureFreshSession]);

  const getIdToken = useCallback(async () => {
    const session = await ensureFreshSession();
    return session?.idToken || null;
  }, [ensureFreshSession]);

  const invalidateAndRefresh = useCallback(async () => {
    return ensureFreshSession({ force: true });
  }, [ensureFreshSession]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      booting,
      busy,
      error,
      setError,
      signUp,
      updateProfile,
      confirmSignUp,
      resendCode,
      signIn,
      signOut,
      deleteAccount,
      forgotPassword,
      confirmForgotPassword,
      changePassword,
      getAccessToken,
      getIdToken,
      invalidateAndRefresh,
      restore,
      cachedProfile: user,
    }),
    [
      user,
      booting,
      busy,
      error,
      signUp,
      updateProfile,
      confirmSignUp,
      resendCode,
      signIn,
      signOut,
      deleteAccount,
      forgotPassword,
      confirmForgotPassword,
      changePassword,
      getAccessToken,
      getIdToken,
      invalidateAndRefresh,
      restore,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
