import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * Hook to consume AuthContext.
 * Must be used inside <AuthProvider>.
 */
const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
};

export default useAuth;