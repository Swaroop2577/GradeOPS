import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import GradeCard from './GradeCard';
import OverrideModal from './OverrideModal';
import KeyboardShortcuts, { ShortcutHelp } from './KeyboardShortcuts';
import StatusBadge from '../shared/StatusBadge';
import ExportButton from '../shared/ExportButton';
import api from '../../services/api';

const STATUS_FILTERS = ['all', 'pending', 'approved', 'overridden'];

/**
 * Normalise a grade record from the API into the shape GradeCard expects.
 */
function normaliseGrade(g) {
  return {
    _id: g._id,
    aiScore: g.aiScore ?? g.ai_score ?? g.totalScore ?? 0,
    maxPoints: g.maxScore ?? g.max_score ?? g.maxPoints ?? 100,
    confidence: g.confidence ?? 1,
    status: g.status ?? 'pending',
    justification: g.justification ?? g.overall_justification ?? g.studentFeedback ?? '',
    taScore: g.taScore ?? null,
    taComment: g.taComment ?? g.ta_comment ?? '',
    criteria: (g.criteria || g.question_grades || []).map((c) => ({
      label: c.label || c.description || c.criterion_id || '—',
      awarded: c.awarded ?? c.score ?? 0,
      max: c.max ?? c.max_points ?? 0,
    })),
    question: {
      number: g.question?.number ?? g.questionNumber ?? 1,
      title: g.question?.title ?? g.questionTitle ?? '',
    },
    student: {
      id: g.student?.id ?? g.studentId ?? g.submission?.studentId ?? '—',
      name: g.student?.name ?? g.studentName ?? '',
    },
    cropUrl: g.cropUrl ?? g.crop_url ?? null,
  };
}

const ReviewDashboard = ({ examId }) => {
  const [grades, setGrades]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [showOverride, setShowOverride] = useState(false);
  const [showHelp, setShowHelp]         = useState(false);

  // ─── Fetch real grades ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!examId) return;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const { data } = await api.get(`/grades/${examId}`);
        const raw = data.grades ?? data.data?.grades ?? [];
        setGrades(raw.map(normaliseGrade));
        setCurrentIdx(0);
      } catch (err) {
        if (err.response?.status === 404) {
          setGrades([]);
        } else {
          setError('Failed to load grades. Is the server running?');
          console.error('[ReviewDashboard]', err);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId]);

  const filtered = useMemo(
    () => statusFilter === 'all' ? grades : grades.filter((g) => g.status === statusFilter),
    [grades, statusFilter]
  );

  const current = filtered[currentIdx] ?? null;

  const counts = useMemo(() => {
    const c = { all: grades.length };
    STATUS_FILTERS.slice(1).forEach((st) => { c[st] = grades.filter((g) => g.status === st).length; });
    return c;
  }, [grades]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const updateGrade = (id, patch) =>
    setGrades((gs) => gs.map((g) => (g._id === id ? { ...g, ...patch } : g)));

  const goNext = useCallback(() =>
    setCurrentIdx((i) => Math.min(i + 1, filtered.length - 1)), [filtered.length]);
  const goPrev = useCallback(() =>
    setCurrentIdx((i) => Math.max(i - 1, 0)), []);

  const handleApprove = useCallback(async () => {
    if (!current) return;
    try {
      await api.patch(`/grades/${current._id}/approve`);
      updateGrade(current._id, { status: 'approved' });
      toast.success('Grade approved ✓', { icon: '✓', style: { borderLeft: '3px solid #22c55e' } });
      goNext();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approve failed');
    }
  }, [current, goNext]);

  const handleReject = useCallback(() => {
    if (!current) return;
    setShowOverride(true);
  }, [current]);

  const handleSkip = useCallback(() => {
    if (!current) return;
    toast('Skipped', { icon: '→' });
    goNext();
  }, [current, goNext]);

  const handleOverrideConfirm = async ({ score, reason }) => {
    if (!current) return;
    try {
      await api.patch(`/grades/${current._id}/override`, { score, reason });
      updateGrade(current._id, { status: 'overridden', taScore: score, taComment: reason });
      toast.success('Grade overridden', { icon: '✎' });
      setShowOverride(false);
      goNext();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Override failed');
    }
  };

  // ─── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Loading review queue…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#E24B4A', fontFamily: 'var(--font-mono)' }}>
        {error}
      </div>
    );
  }

  const pendingLeft = counts.pending;

  return (
    <div style={s.wrapper}>
      <KeyboardShortcuts
        disabled={showOverride || showHelp}
        onApprove={handleApprove}
        onReject={handleReject}
        onSkip={handleSkip}
        onNext={goNext}
        onPrev={goPrev}
        onHelp={() => setShowHelp(true)}
      />

      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Review Queue</h2>
          <p style={s.sub}>
            {pendingLeft} pending · {currentIdx + 1} of {filtered.length} shown
          </p>
        </div>
        <div style={s.headerRight}>
          <ExportButton examId={examId} />
          <button style={s.helpBtn} onClick={() => setShowHelp(true)} title="Keyboard shortcuts (?)">
            ⌨ Shortcuts
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={s.progressBar}>
        <div
          style={{
            ...s.progressFill,
            width: `${grades.length ? ((counts.approved + (counts.overridden ?? 0)) / grades.length) * 100 : 0}%`,
          }}
        />
      </div>
      <div style={s.progressLabel}>
        {counts.approved + (counts.overridden ?? 0)} / {grades.length} reviewed
      </div>

      {/* Status filter */}
      <div style={s.filterRow}>
        {STATUS_FILTERS.map((st) => (
          <button
            key={st}
            style={{ ...s.filterBtn, ...(statusFilter === st ? s.filterBtnActive : {}) }}
            onClick={() => { setStatusFilter(st); setCurrentIdx(0); }}
          >
            {st === 'all' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)}
            <span style={s.filterCount}>{counts[st] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      {grades.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>◈</div>
          <div style={s.emptyText}>
            No graded submissions yet. Start the pipeline from the Overview tab.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>◈</div>
          <div style={s.emptyText}>
            {statusFilter === 'pending' ? 'All caught up! No pending reviews.' : `No ${statusFilter} grades.`}
          </div>
        </div>
      ) : (
        <div style={s.layout}>
          {/* Left: list */}
          <div style={s.list}>
            {filtered.map((g, i) => (
              <ListItem
                key={g._id}
                grade={g}
                isActive={i === currentIdx}
                onSelect={() => setCurrentIdx(i)}
              />
            ))}
          </div>

          {/* Right: detail */}
          <div style={s.detail}>
            {current && (
              <>
                <GradeCard
                  grade={current}
                  student={current.student}
                  question={current.question}
                  cropUrl={current.cropUrl}
                  isActive
                />

                {/* Action bar */}
                <div style={s.actionBar}>
                  <button style={s.prevBtn} onClick={goPrev} disabled={currentIdx === 0}>
                    ← Prev (P)
                  </button>
                  <div style={s.mainActions}>
                    <button
                      style={{ ...s.actionBtn, ...s.rejectBtn }}
                      onClick={handleReject}
                      disabled={current.status !== 'pending'}
                    >
                      R — Override
                    </button>
                    <button style={{ ...s.actionBtn, ...s.skipBtn }} onClick={handleSkip}>
                      S — Skip
                    </button>
                    <button
                      style={{ ...s.actionBtn, ...s.approveBtn }}
                      onClick={handleApprove}
                      disabled={current.status !== 'pending'}
                    >
                      A — Approve ✓
                    </button>
                  </div>
                  <button
                    style={s.nextBtn}
                    onClick={goNext}
                    disabled={currentIdx === filtered.length - 1}
                  >
                    Next (N) →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Override modal */}
      {showOverride && current && (
        <OverrideModal
          grade={current}
          onConfirm={handleOverrideConfirm}
          onClose={() => setShowOverride(false)}
        />
      )}

      {/* Shortcut help */}
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
};

/* ─── ListItem ────────────────────────────────────────────────────────────── */
const ListItem = ({ grade, isActive, onSelect }) => (
  <div
    style={{ ...s.listItem, ...(isActive ? s.listItemActive : {}) }}
    onClick={onSelect}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onSelect()}
  >
    <div style={s.listQNum}>Q{grade.question?.number}</div>
    <div style={s.listStudent}>{grade.student?.id}</div>
    <div style={s.listScore}>{grade.aiScore}/{grade.maxPoints}</div>
    <StatusBadge status={grade.status} compact />
  </div>
);

const s = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 16 },
  header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  title:   { fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  sub:     { fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 },
  headerRight: { display: 'flex', gap: 10, alignItems: 'center' },

  progressBar:  { height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--success)', borderRadius: 2, transition: 'width .4s' },
  progressLabel:{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: -10 },

  filterRow: { display: 'flex', gap: 4 },
  filterBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
    background: 'none', border: '1px solid var(--border)',
    color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', cursor: 'pointer',
  },
  filterBtnActive: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-bg)' },
  filterCount: {
    fontSize: 10, background: 'var(--bg-3)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '1px 6px', color: 'var(--text-secondary)',
  },

  layout: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' },

  list: {
    display: 'flex', flexDirection: 'column', gap: 2,
    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden',
  },
  listItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    background: 'var(--bg-2)', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', transition: 'background .1s',
  },
  listItemActive: { background: 'var(--accent-bg)', borderLeft: '2px solid var(--accent)' },
  listQNum:    { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 },
  listStudent: { fontSize: 12, color: 'var(--text-secondary)', flex: 1 },
  listScore:   { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 },

  detail: { display: 'flex', flexDirection: 'column', gap: 12 },

  actionBar: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--bg-2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '12px 16px',
  },
  mainActions: { display: 'flex', gap: 8, flex: 1, justifyContent: 'center' },
  actionBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
    border: 'none', borderRadius: 'var(--radius-sm)', padding: '9px 18px', cursor: 'pointer',
    letterSpacing: '0.04em', transition: 'opacity .15s',
  },
  rejectBtn:  { background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' },
  skipBtn:    { background: 'var(--bg-3)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  approveBtn: { background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' },

  prevBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '7px 12px', cursor: 'pointer', flexShrink: 0,
  },
  nextBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '7px 12px', cursor: 'pointer', flexShrink: 0,
  },

  helpBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '6px 12px', cursor: 'pointer',
  },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '64px 32px' },
  emptyIcon: { fontFamily: 'var(--font-mono)', fontSize: 32, color: 'var(--border-hi)' },
  emptyText: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 360 },
};

export default ReviewDashboard;