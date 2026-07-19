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
} from './cognitoClient';
import { purgeAccountData } from './apiClient';
import {
  clearTokens,
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
    setTokens(sessionTokens);
    const raw = await getUser(sessionTokens.accessToken);
    const profile = attributesToObject(raw);
    await saveProfile(profile);
    setUser(profile);
    return profile;
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
      if (!stored.accessToken || (stored.expiresAt && Date.now() > stored.expiresAt)) {
        if (!stored.refreshToken) {
          await clearTokens();
          setUser(null);
          setTokens(null);
          return;
        }
        session = await refreshSession(stored.refreshToken);
        await saveTokens(session);
      }

      setTokens(session);
      try {
        const raw = await getUser(session.accessToken);
        const profile = attributesToObject(raw);
        await saveProfile(profile);
        setUser(profile);
      } catch {
        // Token may be stale — try refresh once
        if (session.refreshToken) {
          const refreshed = await refreshSession(session.refreshToken);
          await applySession(refreshed);
        } else {
          await clearTokens();
          setUser(null);
          setTokens(null);
        }
      }
    } catch (e) {
      await clearTokens();
      setUser(null);
      setTokens(null);
      setError(e.message);
    } finally {
      setBooting(false);
    }
  }, [applySession]);

  useEffect(() => {
    restore();
  }, [restore]);

  const signUp = useCallback(async ({ email, password, name }) => {
    setBusy(true);
    setError(null);
    try {
      const result = await cognitoSignUp({ email, password, name });
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
      await clearTokens();
      setTokens(null);
      setUser(null);
      setBusy(false);
    }
  }, [tokens]);

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
      // Purge server-side data while JWT still valid, then delete Cognito user
      try {
        await purgeAccountData();
      } catch (purgeErr) {
        // Continue with Cognito delete even if purge soft-fails
        console.warn('Account purge warning:', purgeErr?.message);
      }
      await cognitoDeleteUser(access);
      await clearTokens();
      setTokens(null);
      setUser(null);
      return true;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [tokens]);

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

  const getAccessToken = useCallback(async () => {
    let session = tokens || (await loadTokens());
    if (!session) return null;

    if (!session.accessToken || (session.expiresAt && Date.now() > session.expiresAt)) {
      if (!session.refreshToken) return null;
      try {
        session = await refreshSession(session.refreshToken);
        await saveTokens(session);
        setTokens(session);
      } catch {
        await clearTokens();
        setTokens(null);
        setUser(null);
        return null;
      }
    }
    return session.accessToken;
  }, [tokens]);

  /** ID token is preferred for API Gateway Cognito authorizers */
  const getIdToken = useCallback(async () => {
    let session = tokens || (await loadTokens());
    if (!session) return null;

    if (!session.idToken || (session.expiresAt && Date.now() > session.expiresAt)) {
      if (!session.refreshToken) return null;
      try {
        session = await refreshSession(session.refreshToken);
        await saveTokens(session);
        setTokens(session);
      } catch {
        return null;
      }
    }
    return session.idToken;
  }, [tokens]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      booting,
      busy,
      error,
      setError,
      signUp,
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
      restore,
      cachedProfile: user,
    }),
    [
      user,
      booting,
      busy,
      error,
      signUp,
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
