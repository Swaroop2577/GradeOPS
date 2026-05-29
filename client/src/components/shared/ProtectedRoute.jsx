import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

/**
 * ProtectedRoute — renders children only if authenticated.
 * Optionally restricts to specific roles.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 *
 *   <Route element={<ProtectedRoute roles={['instructor']} />}>
 *     <Route path="/admin" element={<Admin />} />
 *   </Route>
 */
const ProtectedRoute = ({ roles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg)',
      }}>
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    // Redirect to their own dashboard — no separate /unauthorized page needed
    return <Navigate to={user.role === 'instructor' ? '/instructor' : '/ta'} replace />;
  }

  return <Outlet />;
};

const Spinner = () => (
  <div style={{
    width: 32, height: 32,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  }} />
);

export default ProtectedRoute;