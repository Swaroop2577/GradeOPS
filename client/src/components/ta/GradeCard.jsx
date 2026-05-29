import React from 'react';
import StatusBadge from '../shared/StatusBadge';

/**
 * GradeCard — displays a single answer review card.
 * Shows the cropped student answer image alongside the AI-proposed grade and justification.
 *
 * Props:
 *  grade: { _id, submissionId, aiScore, maxPoints, justification, confidence, status, criteria }
 *  student: { id, name }
 *  question: { title, number }
 *  cropUrl: string (image URL of the handwritten answer crop)
 *  isActive: boolean (highlighted when selected in the review queue)
 *  onSelect: fn
 */
const GradeCard = ({
  grade,
  student,
  question,
  cropUrl,
  isActive = false,
  onSelect,
}) => {
  const scorePercent = grade.maxPoints > 0
    ? Math.round((grade.aiScore / grade.maxPoints) * 100)
    : 0;

  const confidenceColor =
    grade.confidence >= 0.8 ? 'var(--success)' :
    grade.confidence >= 0.6 ? 'var(--accent)' :
    'var(--error)';

  return (
    <div
      style={{ ...s.card, ...(isActive ? s.cardActive : {}) }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.()}
      aria-selected={isActive}
    >
      {/* Card header */}
      <div style={s.cardHeader}>
        <div style={s.qLabel}>
          <span style={s.qNum}>Q{question?.number}</span>
          <span style={s.qTitle}>{question?.title}</span>
        </div>
        <div style={s.headerRight}>
          <StatusBadge status={grade.status} />
          <div style={s.scoreChip}>
            {grade.aiScore} / {grade.maxPoints}
          </div>
        </div>
      </div>

      {/* Body: image + grade info */}
      <div style={s.body}>
        {/* Cropped answer image */}
        <div style={s.imagePane}>
          <div style={s.imageLabel}>Student answer</div>
          {cropUrl ? (
            <img
              src={cropUrl}
              alt={`Student ${student?.id} answer for Q${question?.number}`}
              style={s.image}
            />
          ) : (
            <div style={s.imagePlaceholder}>
              <span style={s.imagePlaceholderIcon}>📄</span>
              <span style={s.imagePlaceholderText}>Image will appear after OCR (Phase 3)</span>
            </div>
          )}
          <div style={s.studentTag}>
            {student?.name || student?.id}
          </div>
        </div>

        {/* AI grade details */}
        <div style={s.gradePane}>
          {/* Score bar */}
          <div style={s.scoreSection}>
            <div style={s.scoreLabelRow}>
              <span style={s.gradeLabel}>AI Score</span>
              <span style={s.scorePercent}>{scorePercent}%</span>
            </div>
            <div style={s.scoreBar}>
              <div style={{
                ...s.scoreBarFill,
                width: `${scorePercent}%`,
                background: scorePercent >= 70 ? 'var(--success)' : scorePercent >= 40 ? 'var(--accent)' : 'var(--error)',
              }} />
            </div>
          </div>

          {/* Confidence */}
          <div style={s.confidenceRow}>
            <span style={s.gradeLabel}>Confidence</span>
            <span style={{ ...s.confidenceVal, color: confidenceColor }}>
              {Math.round((grade.confidence ?? 0) * 100)}%
            </span>
          </div>

          {/* Per-criterion breakdown */}
          {grade.criteria?.length > 0 && (
            <div style={s.criteriaSection}>
              <div style={s.gradeLabel}>Criterion breakdown</div>
              {grade.criteria.map((c, i) => (
                <div key={i} style={s.criterionRow}>
                  <div style={s.criterionName}>{c.label}</div>
                  <div style={s.criterionScore}>
                    <span style={{ color: c.awarded > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {c.awarded}
                    </span>
                    <span style={s.criterionMax}>/{c.max}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Justification */}
          <div style={s.justSection}>
            <div style={s.gradeLabel}>AI Justification</div>
            <div style={s.justText}>
              {grade.justification || (
                <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                  Justification will appear after grading (Phase 4)
                </span>
              )}
            </div>
          </div>

          {/* Low confidence warning */}
          {(grade.confidence ?? 1) < 0.6 && (
            <div style={s.lowConfWarn}>
              ⚠ Low confidence — mandatory TA review required
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const s = {
  card: {
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'border-color .15s',
  },
  cardActive: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent)',
  },

  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'var(--bg-3)',
    borderBottom: '1px solid var(--border)',
    gap: 12,
  },
  qLabel: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  qNum: {
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
    color: 'var(--accent)', background: 'var(--accent-bg)',
    border: '1px solid var(--accent-border)', borderRadius: 3, padding: '2px 7px', flexShrink: 0,
  },
  qTitle: { fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  scoreChip: {
    fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
    color: 'var(--text-primary)', background: 'var(--bg-2)',
    border: '1px solid var(--border)', borderRadius: 4, padding: '3px 10px',
  },

  body: { display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 280 },

  // Image pane
  imagePane: {
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', gap: 0,
    background: 'var(--bg)',
  },
  imageLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--text-muted)', padding: '8px 14px', borderBottom: '1px solid var(--border)',
  },
  image: { width: '100%', flex: 1, objectFit: 'contain', display: 'block', maxHeight: 300 },
  imagePlaceholder: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 24, color: 'var(--text-muted)',
  },
  imagePlaceholderIcon: { fontSize: 28 },
  imagePlaceholderText: { fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'center', lineHeight: 1.6 },
  studentTag: {
    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)',
    padding: '6px 14px', borderTop: '1px solid var(--border)',
  },

  // Grade pane
  gradePane: { padding: 16, display: 'flex', flexDirection: 'column', gap: 14 },
  gradeLabel: { fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 },

  scoreSection: {},
  scoreLabelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  scorePercent: { fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  scoreBar: { height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 2, transition: 'width .4s ease' },

  confidenceRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  confidenceVal: { fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 },

  criteriaSection: { display: 'flex', flexDirection: 'column', gap: 6 },
  criterionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 },
  criterionName: { color: 'var(--text-secondary)', flex: 1 },
  criterionScore: { fontFamily: 'var(--font-mono)', fontSize: 12 },
  criterionMax: { color: 'var(--text-muted)' },

  justSection: {},
  justText: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, background: 'var(--bg-3)', borderRadius: 'var(--radius-md)', padding: '10px 12px', border: '1px solid var(--border)' },

  lowConfWarn: {
    fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
    color: '#f59e0b', background: 'rgba(245,158,11,0.08)',
    border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '8px 12px',
  },
};

export default GradeCard;