"use client";

import { createContext, useContext, useMemo } from "react";

const DEFAULT_CAPABILITIES = {
  role: "worker",
  isSuperAdmin: false,
  isAdmin: false,
  isWorker: true,
  canReadTenantData: true,
  canWriteOperationalData: true,
  canDeleteRecords: false,
  canManageSensitiveData: false,
  canSendExternalCommunications: false,
};

const AuthSessionContext = createContext(null);

export function AuthSessionProvider({
  children,
  authUser = null,
  authChecked = false,
  refreshSession = async () => {},
}) {
  const value = useMemo(() => {
    const capabilities = authUser?.capabilities || DEFAULT_CAPABILITIES;
    return {
      authUser,
      capabilities,
      authChecked,
      refreshSession,
      isAuthenticated: Boolean(authUser?.userId),
    };
  }, [authUser, authChecked, refreshSession]);

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  return useContext(AuthSessionContext);
}

export { DEFAULT_CAPABILITIES };
