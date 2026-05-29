import React from 'react';

const CONFIG = {
  // Upload
  pending:         { label: 'Pending',           icon: '○', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)',  color: '#93c5fd' },
  uploading:       { label: 'Uploading',          icon: '↑', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#fcd34d' },
  success:         { label: 'Uploaded',           icon: '✓', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  color: '#4ade80' },
  error:           { label: 'Error',              icon: '✗', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',   color: '#fca5a5' },

  // Exam pipeline statuses
  uploaded:        { label: 'Uploaded',           icon: '✓', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)',  color: '#93c5fd' },
  ocr:             { label: 'OCR Running',        icon: '⟳', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#fcd34d', spin: true },
  grading:         { label: 'AI Grading',         icon: '⟳', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#fcd34d', spin: true },
  graded:          { label: 'TA Review Pending',  icon: '◷', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)', color: '#c4b5fd' },
  reviewed:        { label: 'Reviewed',           icon: '✓', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  color: '#4ade80' },
  exported:        { label: 'Exported',           icon: '↓', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  color: '#4ade80' },

  // Grade review statuses
  ai_graded:       { label: 'AI Graded',          icon: '◈', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#fcd34d' },
  pending_review:  { label: 'Review Pending',     icon: '◷', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)', color: '#c4b5fd' },
  approved:        { label: 'Approved',           icon: '✓', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  color: '#4ade80' },
  overridden:      { label: 'Overridden',         icon: '✎', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)', color: '#c4b5fd' },
  flagged:         { label: 'Flagged',            icon: '⚑', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',   color: '#fca5a5' },

  // Legacy / misc
  queued:          { label: 'Queued',             icon: '⋯', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)',  color: '#93c5fd' },
  complete:        { label: 'Complete',           icon: '✓', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  color: '#4ade80' },
  failed:          { label: 'Failed',             icon: '✗', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',   color: '#fca5a5' },
};

const DEFAULT = { label: '—', icon: '·', bg: 'var(--bg-3)', border: 'var(--border)', color: 'var(--text-muted)' };

const StatusBadge = ({ status, compact = false }) => {
  const c = CONFIG[status?.toLowerCase()] ?? DEFAULT;
  const isAnimated = c.spin;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 0 : 5,
        fontFamily: 'var(--font-mono)',
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        padding: compact ? '2px 6px' : '3px 9px',
        borderRadius: 3,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.color,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
      title={c.label}
    >
      <span style={{ animation: isAnimated ? 'spin 1.2s linear infinite' : 'none', display: 'inline-block' }}>
        {c.icon}
      </span>
      {!compact && <span>{c.label}</span>}
    </span>
  );
};

export default StatusBadge;