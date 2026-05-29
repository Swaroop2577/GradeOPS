import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';

const ROLES = [
  {
    value: 'instructor',
    label: 'Instructor',
    desc: 'Upload exams, define rubrics, review analytics',
  },
  {
    value: 'ta',
    label: 'Teaching Assistant',
    desc: 'Review AI-proposed grades, approve or override',
  },
];

const INITIAL = { name: '', email: '', password: '', confirmPassword: '', role: 'instructor' };

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: '' }));
    if (apiError) setApiError('');
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Name must be at least 2 characters';
    if (!form.email || !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password || form.password.length < 8) errs.password = 'Min 8 characters';
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(form.password))
      errs.password = 'Must include uppercase, lowercase, and a number';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setApiError('');
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.toLowerCase().trim(),
        password: form.password,
        role: form.role,
      });
      toast.success('Account created!');
      navigate(user.role === 'instructor' ? '/instructor' : '/ta', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed. Please try again.';
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = (() => {
    const p = form.password;
    if (!p) return null;
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[a-z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    return score;
  })();

  const pwColors = ['#ef4444', '#ef4444', '#f59e0b', '#22c55e', '#22c55e'];
  const pwLabels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Strong'];

  return (
    <div style={styles.page}>
      <div style={styles.formPanel}>
        <div style={styles.formCard} className="fade-up">
          <Link to="/login" style={styles.back}>← Back to sign in</Link>

          <div style={styles.logo}>
            <span style={styles.logoMark}>◈</span>
            <span style={styles.logoText}>GRADEOPS</span>
          </div>

          <h1 style={styles.heading}>Create account</h1>
          <p style={styles.sub}>Join the GradeOps grading platform</p>

          {apiError && (
            <div style={styles.errorBox} role="alert">
              <span>⚠</span> {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit} style={styles.form} noValidate>
            {/* Role selector */}
            <div style={styles.field}>
              <label style={styles.label}>I am a</label>
              <div style={styles.roleRow}>
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    style={{
                      ...styles.roleBtn,
                      ...(form.role === r.value ? styles.roleBtnActive : {}),
                    }}
                    onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                  >
                    <span style={styles.roleLabel}>{r.label}</span>
                    <span style={styles.roleDesc}>{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <Field label="Full name" error={errors.name}>
              <input
                name="name"
                type="text"
                autoComplete="name"
                autoFocus
                value={form.name}
                onChange={handleChange}
                placeholder="Dr. Jane Smith"
                disabled={loading}
                style={{ ...styles.input, ...(errors.name ? styles.inputError : {}) }}
              />
            </Field>

            {/* Email */}
            <Field label="University email" error={errors.email}>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@university.edu"
                disabled={loading}
                style={{ ...styles.input, ...(errors.email ? styles.inputError : {}) }}
              />
            </Field>

            {/* Password */}
            <Field label="Password" error={errors.password}>
              <div style={{ position: 'relative' }}>
                <input
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Min 8 chars, mixed case + number"
                  disabled={loading}
                  style={{ ...styles.input, paddingRight: 44, ...(errors.password ? styles.inputError : {}) }}
                />
                <button
                  type="button"
                  style={styles.eyeBtn}
                  onClick={() => setShowPw((v) => !v)}
                  aria-label="Toggle password visibility"
                >
                  {showPw ? '○' : '●'}
                </button>
              </div>
              {pwStrength !== null && (
                <div style={styles.pwStrengthWrap}>
                  <div style={styles.pwBars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        style={{
                          ...styles.pwBar,
                          background: n <= pwStrength ? pwColors[pwStrength - 1] : 'var(--border)',
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ ...styles.pwLabel, color: pwStrength ? pwColors[pwStrength - 1] : 'var(--text-muted)' }}>
                    {pwLabels[pwStrength]}
                  </span>
                </div>
              )}
            </Field>

            {/* Confirm Password */}
            <Field label="Confirm password" error={errors.confirmPassword}>
              <input
                name="confirmPassword"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                disabled={loading}
                style={{ ...styles.input, ...(errors.confirmPassword ? styles.inputError : {}) }}
              />
            </Field>

            <button type="submit" style={styles.submitBtn} disabled={loading}>
              {loading ? <Spinner /> : 'Create account →'}
            </button>
          </form>

          <p style={styles.footer}>
            Already have an account?{' '}
            <Link to="/login" style={styles.link}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

const Field = ({ label, error, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label style={styles.label}>{label}</label>
    {children}
    {error && <span style={styles.fieldError}>{error}</span>}
  </div>
);

const Spinner = () => (
  <span style={{
    display: 'inline-block',
    width: 16, height: 16,
    border: '2px solid rgba(0,0,0,0.2)',
    borderTopColor: '#000',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  }} />
);

/* ─── Styles ─────────────────────────────────────────────────────────────────── */
const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    background: 'var(--bg)',
  },
  formPanel: {
    width: '100%',
    maxWidth: 480,
  },
  formCard: {
    width: '100%',
  },
  back: {
    display: 'inline-block',
    fontSize: 12,
    color: 'var(--text-muted)',
    textDecoration: 'none',
    marginBottom: 24,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.04em',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  logoMark: { color: 'var(--accent)', fontSize: 20 },
  logoText: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: '0.12em',
    color: 'var(--text-primary)',
  },
  heading: {
    fontFamily: 'var(--font-mono)',
    fontSize: 24,
    fontWeight: 700,
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
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono)',
  },
  roleRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  roleBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    padding: '12px 14px',
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color .15s, background .15s',
  },
  roleBtnActive: {
    background: 'var(--accent-bg)',
    border: '1px solid var(--accent)',
  },
  roleLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.04em',
  },
  roleDesc: {
    fontSize: 11,
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  input: {
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius-md)',
    padding: '11px 14px',
    fontSize: 14,
    width: '100%',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
  },
  inputError: {
    borderColor: 'rgba(239,68,68,0.5)',
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
  },
  pwStrengthWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  pwBars: {
    display: 'flex',
    gap: 3,
    flex: 1,
  },
  pwBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    transition: 'background .3s',
  },
  pwLabel: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    minWidth: 40,
  },
  fieldError: {
    fontSize: 12,
    color: '#fca5a5',
  },
  submitBtn: {
    marginTop: 8,
    background: 'var(--accent)',
    color: '#000',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'opacity .15s',
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

export default Register;