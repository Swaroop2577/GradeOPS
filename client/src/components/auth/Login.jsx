import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await login(form);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      navigate(user.role === 'instructor' ? '/instructor' : '/ta', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Left panel — branding */}
      <div style={styles.brand}>
        <div style={styles.brandInner}>
          <div style={styles.logo}>
            <span style={styles.logoMark}>◈</span>
            <span style={styles.logoText}>GRADEOPS</span>
          </div>
          <p style={styles.tagline}>
            Human-in-the-Loop AI grading.<br />
            Consistent. Fast. Fair.
          </p>
          <div style={styles.featureList}>
            {[
              'Vision OCR for handwritten exams',
              'Agentic rubric-grounded scoring',
              'High-throughput TA review dashboard',
              'Plagiarism detection across submissions',
            ].map((f) => (
              <div key={f} style={styles.feature}>
                <span style={styles.featureDot}>▸</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
          <div style={styles.version}>v1.0.0 · Phase 1</div>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={styles.formPanel}>
        <div style={styles.formCard} className="fade-up">
          <h1 style={styles.heading}>Sign in</h1>
          <p style={styles.sub}>Enter your credentials to continue</p>

          {error && (
            <div style={styles.errorBox} role="alert">
              <span style={styles.errorIcon}>⚠</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={styles.form} noValidate>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={form.email}
                onChange={handleChange}
                placeholder="you@university.edu"
                disabled={loading}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="password">Password</label>
              <div style={styles.inputWrap}>
                <input
                  id="password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  disabled={loading}
                  style={{ ...styles.input, paddingRight: 44 }}
                />
                <button
                  type="button"
                  style={styles.eyeBtn}
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? '○' : '●'}
                </button>
              </div>
            </div>

            <button type="submit" style={styles.submitBtn} disabled={loading}>
              {loading ? <Spinner /> : 'Sign in →'}
            </button>
          </form>

          <p style={styles.footer}>
            No account?{' '}
            <Link to="/register" style={styles.link}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

const Spinner = () => (
  <span style={{
    display: 'inline-block',
    width: 16, height: 16,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    verticalAlign: 'middle',
  }} />
);

const styles = {
  page: {
    display: 'flex',
    minHeight: '100vh',
  },

  /* Brand side */
  brand: {
    flex: 1,
    background: 'var(--bg-1)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  brandInner: {
    maxWidth: 380,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 32,
  },
  logoMark: {
    color: 'var(--accent)',
    fontSize: 28,
  },
  logoText: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: '0.12em',
    color: 'var(--text-primary)',
  },
  tagline: {
    fontFamily: 'var(--font-mono)',
    fontSize: 15,
    color: 'var(--text-secondary)',
    lineHeight: 1.7,
    marginBottom: 36,
  },
  featureList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    marginBottom: 48,
  },
  feature: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  featureDot: {
    color: 'var(--accent)',
    fontSize: 11,
    marginTop: 2,
    flexShrink: 0,
  },
  version: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--text-muted)',
    letterSpacing: '0.05em',
  },

  /* Form side */
  formPanel: {
    width: 480,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    background: 'var(--bg)',
  },
  formCard: {
    width: '100%',
    maxWidth: 360,
  },
  heading: {
    fontFamily: 'var(--font-mono)',
    fontSize: 26,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 6,
  },
  sub: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    marginBottom: 28,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--error-bg)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 14px',
    marginBottom: 20,
    fontSize: 13,
    color: '#fca5a5',
  },
  errorIcon: {
    flexShrink: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.06em',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono)',
  },
  input: {
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius-md)',
    padding: '11px 14px',
    fontSize: 14,
    width: '100%',
    transition: 'border-color .15s, box-shadow .15s',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
  },
  inputWrap: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 10,
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  submitBtn: {
    marginTop: 8,
    background: 'var(--accent)',
    color: '#000',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'opacity .15s, transform .1s',
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footer: {
    marginTop: 24,
    fontSize: 13,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  link: {
    color: 'var(--accent)',
    textDecoration: 'none',
    fontWeight: 500,
  },
};

export default Login;