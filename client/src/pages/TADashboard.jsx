import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import ReviewDashboard from '../components/ta/ReviewDashboard';
import api from '../services/api';

const TADashboard = () => {
  const { user }  = useAuth();
  const { examId: routeExamId } = useParams();
  const [assignedExams, setAssignedExams] = useState([]);
  const [activeExamId, setActiveExamId] = useState(routeExamId || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const { data } = await api.get('/exams');
        const exams = data.exams || [];
        setAssignedExams(exams);
        if (!routeExamId && exams.length > 0) {
          setActiveExamId(exams[0]._id);
        }
      } catch (err) {
        setError('Failed to load exams. Is the server running?');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [routeExamId]);

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
      Loading…
    </div>
  );

  if (error) return (
    <div style={{ padding: 48, textAlign: 'center', color: '#E24B4A', fontFamily: 'var(--font-mono)' }}>
      {error}
    </div>
  );

  const activeExam = assignedExams.find((e) => e._id === activeExamId) ?? assignedExams[0];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <div style={s.eyebrow}>TA REVIEW DASHBOARD</div>
          <h1 style={s.heading}>Welcome, {user?.name}</h1>
          <p style={s.sub}>Review AI-proposed grades, approve or override with justifications.</p>
        </div>
      </div>

      {/* Exam selector */}
      <div style={s.examSelectorBar}>
        <div style={s.selectorLabel}>Assigned Exams</div>
        {assignedExams.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
            No exams assigned to you yet.
          </div>
        ) : (
          <div style={s.selectorRow}>
            {assignedExams.map((exam) => {
              const pending = (exam.totalSubmissions || 0) - (exam.reviewedSubmissions || 0);
              return (
                <button
                  key={exam._id}
                  style={{ ...s.examChip, ...(activeExamId === exam._id ? s.examChipActive : {}) }}
                  onClick={() => setActiveExamId(exam._id)}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{exam.course?.code || '—'}</span>
                  <span style={{ color: activeExamId === exam._id ? 'var(--accent)' : 'var(--text-secondary)', marginLeft: 6 }}>{exam.title}</span>
                  {pending > 0 && (
                    <span style={s.pendingBadge}>{pending}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {assignedExams.length > 0 && (
        <>
          {/* Keyboard hint bar */}
          <div style={s.hintBar}>
            {[
              { key: 'A', label: 'Approve' },
              { key: 'R', label: 'Override' },
              { key: 'S', label: 'Skip' },
              { key: 'N', label: 'Next' },
              { key: 'P', label: 'Prev' },
              { key: '?', label: 'Help' },
            ].map(({ key, label }) => (
              <div key={key} style={s.hint}>
                <kbd style={s.kbd}>{key}</kbd>
                <span style={s.hintLabel}>{label}</span>
              </div>
            ))}
          </div>

          {/* Review dashboard */}
          {activeExamId && <ReviewDashboard examId={activeExamId} key={activeExamId} />}
        </>
      )}
    </div>
  );
};

const s = {
  page:       { padding: 32, maxWidth: 1200, margin: '0 auto' },
  pageHeader: { marginBottom: 24 },
  eyebrow:    { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 },
  heading:    { fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' },
  sub:        { color: 'var(--text-secondary)', fontSize: 14, marginTop: 6 },

  examSelectorBar: { marginBottom: 16 },
  selectorLabel:   { fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 },
  selectorRow:     { display: 'flex', gap: 10, flexWrap: 'wrap' },
  examChip: {
    background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
    padding: '8px 14px', fontSize: 13, cursor: 'pointer', transition: 'all .15s',
    display: 'flex', alignItems: 'center', gap: 2,
  },
  examChipActive: { borderColor: 'var(--accent)', background: 'var(--accent-bg)' },
  pendingBadge: {
    marginLeft: 8, background: 'var(--accent)', color: '#000',
    borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
  },

  hintBar: {
    display: 'flex', gap: 16, alignItems: 'center',
    background: 'var(--bg-2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: '8px 16px',
    marginBottom: 20, flexWrap: 'wrap',
  },
  hint:      { display: 'flex', alignItems: 'center', gap: 6 },
  kbd: {
    background: 'var(--bg-1)', border: '1px solid var(--border-hi)', borderRadius: 4,
    padding: '2px 7px', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
    color: 'var(--text-primary)', boxShadow: '0 1px 0 var(--border-hi)',
  },
  hintLabel: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
};

export default TADashboard;
