import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const SIM_COLOR = (score) => {
  if (score >= 0.95) return '#ef4444';
  if (score >= 0.90) return '#f59e0b';
  return '#3b82f6';
};

const PlagiarismReport = ({ examId }) => {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]   = useState('all');

  // ─── Fetch real plagiarism flags from API ──────────────────────────────────
  useEffect(() => {
    if (!examId) return;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const { data } = await api.get(`/plagiarism/${examId}`);
        // Backend returns { flags: [] } or { plagiarismFlags: [] }
        const flags = data.flags ?? data.plagiarismFlags ?? [];
        setItems(
          flags.map((f, i) => ({
            id: f._id || f.id || String(i),
            studentA: f.studentA || f.submission_a || '—',
            studentB: f.studentB || f.submission_b || '—',
            question: f.question || f.question_id || '—',
            similarity: typeof f.similarity === 'number' ? f.similarity : (f.score ?? 0),
            status: f.status || 'pending',
            answerA: f.answerA || f.text_a || '',
            answerB: f.answerB || f.text_b || '',
          }))
        );
      } catch (err) {
        if (err.response?.status === 404) {
          // No plagiarism data yet — treat as empty, not an error
          setItems([]);
        } else {
          setError('Failed to load plagiarism report.');
          console.error('[PlagiarismReport]', err);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [examId]);

  const updateStatus = (id, status) => {
    setItems((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
    if (selected?.id === id) setSelected((f) => ({ ...f, status }));
    // Persist status update to backend
    api.patch(`/plagiarism/${examId}/flag/${id}`, { status }).catch(console.error);
  };

  const filtered = filter === 'all' ? items : items.filter((f) => f.status === filter);
  const counts = {
    all:       items.length,
    pending:   items.filter((f) => f.status === 'pending').length,
    dismissed: items.filter((f) => f.status === 'dismissed').length,
    escalated: items.filter((f) => f.status === 'escalated').length,
  };

  // ─── Render states ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Analysing submissions for similarity…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#E24B4A', fontFamily: 'var(--font-mono)' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={s.wrapper}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Plagiarism Report</h2>
          <p style={s.sub}>Flagged submission pairs with high structural similarity</p>
        </div>
        <div style={s.statRow}>
          {['pending', 'escalated', 'dismissed'].map((st) => (
            <div key={st} style={s.stat}>
              <div style={s.statVal}>{counts[st]}</div>
              <div style={s.statLabel}>{st}</div>
            </div>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>◎</div>
          <div style={s.emptyText}>
            No similarity flags detected for this exam.
          </div>
          <div style={s.emptyHint}>
            Flags appear after the grading pipeline completes OCR for all submissions.
          </div>
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <div style={s.filterRow}>
            {['all', 'pending', 'escalated', 'dismissed'].map((f) => (
              <button
                key={f}
                style={{ ...s.filterTab, ...(filter === f ? s.filterTabActive : {}) }}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f] ?? items.length})
              </button>
            ))}
          </div>

          {/* Content: list + detail panel */}
          <div style={s.content}>
            {/* Flag list */}
            <div style={s.list}>
              {filtered.length === 0 && (
                <div style={s.emptyList}>No flags in this category</div>
              )}
              {filtered.map((flag) => (
                <FlagRow
                  key={flag.id}
                  flag={flag}
                  selected={selected?.id === flag.id}
                  onSelect={() => setSelected(flag)}
                />
              ))}
            </div>

            {/* Detail panel */}
            <div style={s.detail}>
              {selected ? (
                <FlagDetail flag={selected} onAction={updateStatus} />
              ) : (
                <div style={s.noSelection}>
                  <div style={s.noSelIcon}>⟵</div>
                  <div style={s.noSelText}>Select a flagged pair to inspect</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ─── FlagRow ──────────────────────────────────────────────────────────────── */
const FlagRow = ({ flag, selected, onSelect }) => (
  <div
    style={{ ...s.flagRow, ...(selected ? s.flagRowSelected : {}) }}
    onClick={onSelect}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onSelect()}
  >
    <div style={{ ...s.simBar, background: SIM_COLOR(flag.similarity) }}>
      {Math.round(flag.similarity * 100)}%
    </div>
    <div style={s.flagInfo}>
      <div style={s.flagStudents}>{flag.studentA} ↔ {flag.studentB}</div>
      <div style={s.flagQuestion}>{flag.question}</div>
    </div>
    <StatusPill status={flag.status} />
  </div>
);

/* ─── FlagDetail ───────────────────────────────────────────────────────────── */
const FlagDetail = ({ flag, onAction }) => (
  <div style={s.detailInner}>
    <div style={s.detailHeader}>
      <div>
        <div style={s.detailStudents}>{flag.studentA} ↔ {flag.studentB}</div>
        <div style={s.detailQ}>{flag.question}</div>
      </div>
      <div style={{ ...s.simChip, color: SIM_COLOR(flag.similarity), borderColor: SIM_COLOR(flag.similarity) }}>
        {Math.round(flag.similarity * 100)}% similar
      </div>
    </div>

    {/* Side-by-side answers */}
    <div style={s.sideBy}>
      {[
        { sid: flag.studentA, text: flag.answerA },
        { sid: flag.studentB, text: flag.answerB },
      ].map(({ sid, text }) => (
        <div key={sid} style={s.answerPane}>
          <div style={s.answerLabel}>Student {sid}</div>
          <div style={s.answerText}>
            {text ? (
              text
            ) : (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>
                Transcribed answer not yet available (OCR pending).
              </span>
            )}
          </div>
        </div>
      ))}
    </div>

    {/* Actions */}
    {flag.status === 'pending' && (
      <div style={s.actionRow}>
        <button style={s.dismissBtn} onClick={() => onAction(flag.id, 'dismissed')}>
          Dismiss — Not Plagiarism
        </button>
        <button style={s.escalateBtn} onClick={() => onAction(flag.id, 'escalated')}>
          Escalate to Academic Integrity ⚠
        </button>
      </div>
    )}
    {flag.status !== 'pending' && (
      <div style={s.resolvedBanner}>
        Marked as <strong>{flag.status}</strong>
        <button style={s.undoBtn} onClick={() => onAction(flag.id, 'pending')}>Undo</button>
      </div>
    )}
  </div>
);

/* ─── StatusPill ───────────────────────────────────────────────────────────── */
const StatusPill = ({ status }) => {
  const map = {
    pending:   { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    dismissed: { bg: 'rgba(34,197,94,0.08)',  color: '#4ade80', border: 'rgba(34,197,94,0.25)' },
    escalated: { bg: 'rgba(239,68,68,0.08)',  color: '#fca5a5', border: 'rgba(239,68,68,0.3)'  },
  };
  const c = map[status] || map.pending;
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 3,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`, flexShrink: 0,
    }}>
      {status}
    </span>
  );
};

const s = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 20 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  title: { fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  sub:   { fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 },

  statRow:  { display: 'flex', gap: 24 },
  stat:     { textAlign: 'center' },
  statVal:  { fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },
  statLabel:{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' },

  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 32px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)' },
  emptyIcon:  { fontSize: 32, color: 'var(--border-hi)' },
  emptyText:  { fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' },
  emptyHint:  { fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 360 },

  filterRow: { display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 },
  filterTab: {
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
    background: 'none', border: 'none', borderBottom: '2px solid transparent',
    color: 'var(--text-muted)', padding: '8px 14px', cursor: 'pointer', marginBottom: -1,
  },
  filterTabActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },

  content: { display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, minHeight: 400 },

  list:      { display: 'flex', flexDirection: 'column', gap: 4 },
  emptyList: { fontSize: 13, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center', fontFamily: 'var(--font-mono)' },

  flagRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'var(--bg-2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: 12, cursor: 'pointer',
    transition: 'border-color .15s', flexWrap: 'wrap',
  },
  flagRowSelected: { borderColor: 'var(--accent)', background: 'var(--accent-bg)' },

  simBar: {
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
    color: '#fff', padding: '4px 8px', borderRadius: 4, flexShrink: 0, minWidth: 44, textAlign: 'center',
  },
  flagInfo:     { flex: 1, minWidth: 0 },
  flagStudents: { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' },
  flagQuestion: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  detail: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },

  noSelection: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-muted)' },
  noSelIcon:   { fontSize: 28, fontFamily: 'var(--font-mono)' },
  noSelText:   { fontSize: 13, fontFamily: 'var(--font-mono)' },

  detailInner:   { padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  detailHeader:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  detailStudents:{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  detailQ:       { fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 },
  simChip:       { fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 4, border: '1px solid', flexShrink: 0 },

  sideBy:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  answerPane:  { background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 14 },
  answerLabel: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 10, letterSpacing: '0.06em' },
  answerText:  { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },

  actionRow:  { display: 'flex', gap: 10, flexWrap: 'wrap' },
  dismissBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
    color: '#4ade80', background: 'rgba(34,197,94,0.08)',
    border: '1px solid rgba(34,197,94,0.3)', borderRadius: 'var(--radius-sm)',
    padding: '8px 16px', cursor: 'pointer',
  },
  escalateBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
    color: '#fca5a5', background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)',
    padding: '8px 16px', cursor: 'pointer',
  },
  resolvedBanner: {
    background: 'var(--bg-3)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: '10px 14px',
    fontSize: 13, color: 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  undoBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '3px 10px', cursor: 'pointer', marginLeft: 'auto',
  },
};

export default PlagiarismReport;