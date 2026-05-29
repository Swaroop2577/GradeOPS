import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';

const Navbar = () => {
  const { user, logout, isInstructor, isTA } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      toast.success('Signed out');
      navigate('/login');
    } catch {
      toast.error('Logout failed');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <nav style={styles.nav}>
      <Link to="/" style={styles.logo}>
        <span style={styles.logoMark}>◈</span>
        <span style={styles.logoText}>GRADEOPS</span>
      </Link>

      <div style={styles.links}>
        {isInstructor && (
          <>
            <NavLink to="/instructor" style={navLinkStyle} end>Dashboard</NavLink>
            <NavLink to="/instructor/exams" style={navLinkStyle}>Exams</NavLink>
          </>
        )}
        {isTA && (
          <NavLink to="/ta" style={navLinkStyle} end>Review Queue</NavLink>
        )}
      </div>

      <div style={styles.right}>
        <div style={styles.userInfo}>
          <span style={styles.roleBadge}>{user?.role}</span>
          <span style={styles.userName}>{user?.name}</span>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={styles.logoutBtn}
        >
          {loggingOut ? '...' : 'Sign out'}
        </button>
      </div>
    </nav>
  );
};

const navLinkStyle = ({ isActive }) => ({
  ...styles.navLink,
  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
  borderBottom: isActive ? '1px solid var(--accent)' : '1px solid transparent',
});

const styles = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    padding: '0 24px',
    height: 56,
    background: 'var(--bg-1)',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    textDecoration: 'none',
    flexShrink: 0,
  },
  logoMark: {
    color: 'var(--accent)',
    fontSize: 18,
  },
  logoText: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    fontSize: 14,
    color: 'var(--text-primary)',
    letterSpacing: '0.1em',
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  navLink: {
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    fontWeight: 500,
    padding: '18px 14px 17px',
    textDecoration: 'none',
    transition: 'color .15s',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginLeft: 'auto',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    padding: '2px 7px',
    borderRadius: 3,
    background: 'var(--accent-bg)',
    border: '1px solid var(--accent-border)',
    color: 'var(--accent)',
    textTransform: 'uppercase',
  },
  userName: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  logoutBtn: {
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    color: 'var(--text-muted)',
    background: 'none',
    border: '1px solid var(--border)',
    padding: '5px 12px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'color .15s, border-color .15s',
  },
};

export default Navbar;