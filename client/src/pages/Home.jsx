import React from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

const FEATURES = [
  { icon: '◈', title: 'Vision OCR', desc: 'Nougat + Qwen-VL extract even the messiest handwritten answers with high accuracy.' },
  { icon: '⟳', title: 'Agentic Grading', desc: 'LangGraph pipeline awards partial credit against strict rubric criteria with structured justifications.' },
  { icon: '⌨', title: 'TA Review Dashboard', desc: 'High-throughput review interface with keyboard shortcuts — Approve in one keystroke.' },
  { icon: '⚑', title: 'Plagiarism Detection', desc: 'Semantic embeddings flag suspiciously similar submissions across the batch automatically.' },
];

const STATS = [
  { val: '10×', label: 'Faster grading' },
  { val: '94%', label: 'Grading accuracy' },
  { val: '< 1s', label: 'Per review' },
];

const Home = () => {
  const { user } = useAuth();

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.logo}>
          <span style={s.logoMark}>◈</span>
          <span style={s.logoText}>GRADEOPS</span>
        </div>
        <div style={s.navActions}>
          {user ? (
            <Link to={user.role === 'instructor' ? '/instructor' : '/ta'} style={s.ctaBtn}>
              Go to dashboard →
            </Link>
          ) : (
            <>
              <Link to="/login" style={s.navLink}>Sign in</Link>
              <Link to="/register" style={s.ctaBtn}>Get started →</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section style={s.hero}>
        <div style={s.heroInner} className="fade-up">
          <div style={s.heroBadge}>Human-in-the-Loop AI Grading</div>
          <h1 style={s.heroHeading}>
            Grade exams at<br />
            <span style={s.heroAccent}>machine speed.</span>
          </h1>
          <p style={s.heroSub}>
            GradeOps uses Vision Language Models and Agentic LLMs to grade handwritten exams against your rubrics — then surfaces AI decisions to TAs for rapid approval or override.
          </p>
          <div style={s.heroCtas}>
            {user ? (
              <Link to={user.role === 'instructor' ? '/instructor' : '/ta'} style={s.primaryBtn}>
                Open dashboard →
              </Link>
            ) : (
              <>
                <Link to="/register" style={s.primaryBtn}>Start grading →</Link>
                <Link to="/login" style={s.secondaryBtn}>Sign in</Link>
              </>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div style={s.statsRow}>
          {STATS.map((st) => (
            <div key={st.val} style={s.stat}>
              <div style={s.statVal}>{st.val}</div>
              <div style={s.statLabel}>{st.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div style={s.divider} />

      {/* Features */}
      <section style={s.features}>
        <div style={s.sectionLabel}>What GradeOps does</div>
        <h2 style={s.sectionHeading}>End-to-end exam grading pipeline</h2>
        <div style={s.featureGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} style={s.featureCard}>
              <div style={s.featureIcon}>{f.icon}</div>
              <div style={s.featureTitle}>{f.title}</div>
              <div style={s.featureDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline flow */}
      <section style={s.pipeline}>
        <div style={s.sectionLabel}>How it works</div>
        <div style={s.flow}>
          {[
            { step: '01', title: 'Upload PDFs', desc: 'Drag & drop bulk exam scans' },
            { step: '02', title: 'Define rubric', desc: 'Set questions & scoring criteria' },
            { step: '03', title: 'OCR extraction', desc: 'Vision models read handwriting' },
            { step: '04', title: 'AI grading', desc: 'LangGraph awards partial credit' },
            { step: '05', title: 'TA review', desc: 'Approve or override with one key' },
            { step: '06', title: 'Export', desc: 'CSV/PDF for your LMS' },
          ].map((f, i, arr) => (
            <React.Fragment key={f.step}>
              <div style={s.flowStep}>
                <div style={s.flowNum}>{f.step}</div>
                <div style={s.flowTitle}>{f.title}</div>
                <div style={s.flowDesc}>{f.desc}</div>
              </div>
              {i < arr.length - 1 && <div style={s.flowArrow}>→</div>}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section style={s.ctaStrip}>
        <h2 style={s.ctaHeading}>Ready to cut grading time by 10×?</h2>
        <Link to="/register" style={s.primaryBtn}>Create free account →</Link>
      </section>

      {/* Footer */}
      <footer style={s.footer}>
        <span style={s.footerLogo}>◈ GRADEOPS</span>
        <span style={s.footerMeta}>Built with React · Node.js · MongoDB · LangGraph</span>
      </footer>
    </div>
  );
};

const s = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' },

  nav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 48px', height: 64,
    borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100,
    background: 'rgba(10,10,11,0.85)', backdropFilter: 'blur(8px)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 8 },
  logoMark: { color: 'var(--accent)', fontSize: 20 },
  logoText: { fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, letterSpacing: '0.12em', color: 'var(--text-primary)' },
  navActions: { display: 'flex', alignItems: 'center', gap: 16 },
  navLink: { fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' },
  ctaBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
    color: '#000', background: 'var(--accent)', border: 'none',
    borderRadius: 'var(--radius-sm)', padding: '8px 18px', cursor: 'pointer',
    textDecoration: 'none', letterSpacing: '0.04em',
  },

  hero: {
    padding: '96px 48px 64px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 48,
    background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(245,158,11,0.07) 0%, transparent 70%)',
    textAlign: 'center',
  },
  heroInner: { maxWidth: 640, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 },
  heroBadge: {
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-bg)',
    border: '1px solid var(--accent-border)', borderRadius: 20, padding: '4px 14px',
  },
  heroHeading: {
    fontFamily: 'var(--font-mono)', fontSize: 52, fontWeight: 700, lineHeight: 1.1,
    color: 'var(--text-primary)', letterSpacing: '-0.03em',
  },
  heroAccent: { color: 'var(--accent)' },
  heroSub: { fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 520 },
  heroCtas: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  primaryBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
    color: '#000', background: 'var(--accent)',
    borderRadius: 'var(--radius-md)', padding: '12px 24px',
    textDecoration: 'none', letterSpacing: '0.04em',
  },
  secondaryBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 13,
    color: 'var(--text-secondary)', background: 'none',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 24px',
    textDecoration: 'none',
  },

  statsRow: { display: 'flex', gap: 64, flexWrap: 'wrap', justifyContent: 'center' },
  stat: { textAlign: 'center' },
  statVal: { fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 700, color: 'var(--text-primary)' },
  statLabel: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },

  divider: { height: 1, background: 'var(--border)', margin: '0 48px' },

  features: { padding: '80px 48px', maxWidth: 1100, margin: '0 auto', width: '100%' },
  sectionLabel: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12 },
  sectionHeading: { fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 36 },
  featureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 },
  featureCard: {
    background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
    padding: 24, display: 'flex', flexDirection: 'column', gap: 10,
  },
  featureIcon: { fontSize: 24, color: 'var(--accent)' },
  featureTitle: { fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  featureDesc: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },

  pipeline: { padding: '0 48px 80px', maxWidth: 1200, margin: '0 auto', width: '100%' },
  flow: { display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginTop: 28 },
  flowStep: {
    background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
    padding: '16px 18px', minWidth: 130, flex: 1,
  },
  flowNum: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, letterSpacing: '0.06em' },
  flowTitle: { fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 },
  flowDesc: { fontSize: 12, color: 'var(--text-muted)' },
  flowArrow: { color: 'var(--border-hi)', fontSize: 16, alignSelf: 'center', padding: '0 2px', flexShrink: 0 },

  ctaStrip: {
    margin: '0 48px 48px', padding: '48px',
    background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24,
  },
  ctaHeading: { fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },

  footer: {
    padding: '24px 48px',
    borderTop: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    marginTop: 'auto',
  },
  footerLogo: { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' },
  footerMeta: { fontSize: 12, color: 'var(--text-muted)' },
};

export default Home;