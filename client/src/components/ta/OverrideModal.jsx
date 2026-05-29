import React, { useEffect, useRef, useState } from 'react';

/**
 * OverrideModal — shown when a TA clicks Reject to override the AI grade.
 *
 * Props:
 *   grade: { _id, aiScore, maxPoints, question }
 *   onConfirm: fn({ score, reason })
 *   onClose: fn
 */
const OverrideModal = ({ grade, onConfirm, onClose }) => {
  const [score, setScore] = useState(grade?.aiScore ?? 0);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scoreRef = useRef(null);

  // Focus score input on open, trap focus inside modal
  useEffect(() => {
    scoreRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const validate = () => {
    if (!reason.trim() || reason.trim().length < 10) {
      setReasonError('Please provide a reason (min 10 characters)');
      return false;
    }
    return true;
  };

  const handleConfirm = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onConfirm({ score: Number(score), reason: reason.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  const scoreNum = Number(score);
  const isValidScore = !isNaN(scoreNum) && scoreNum >= 0 && scoreNum <= (grade?.maxPoints ?? 0);

  return (
    <>
      {/* Backdrop */}
      <div style={s.backdrop} onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div style={s.modal} role="dialog" aria-modal="true" aria-labelledby="override-title">
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.titleLabel}>Override AI Grade</div>
            <div style={s.subtitle}>
              {grade?.question?.title ?? 'Question'} · AI proposed {grade?.aiScore} / {grade?.maxPoints}
            </div>
          </div>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div style={s.body}>
          {/* Score input */}
          <div style={s.field}>
            <label style={s.label} htmlFor="override-score">
              Corrected score
            </label>
            <div style={s.scoreRow}>
              <input
                id="override-score"
                ref={scoreRef}
                type="number"
                min={0}
                max={grade?.maxPoints ?? 0}
                step={0.5}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                style={{ ...s.input, ...s.scoreInput, ...(isValidScore ? {} : s.inputError) }}
              />
              <span style={s.scoreSep}>/</span>
              <span style={s.maxScore}>{grade?.maxPoints ?? 0} pts</span>

              {/* Quick-set buttons */}
              <div style={s.quickBtns}>
                {[0, grade?.maxPoints ? Math.round(grade.maxPoints * 0.5) : null, grade?.maxPoints].filter(Boolean).map((v) => (
                  <button key={v} style={s.quickBtn} onClick={() => setScore(v)}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {!isValidScore && (
              <span style={s.fieldError}>Score must be between 0 and {grade?.maxPoints}</span>
            )}
          </div>

          {/* Reason */}
          <div style={s.field}>
            <label style={s.label} htmlFor="override-reason">
              Reason for override <span style={s.required}>*</span>
            </label>
            <textarea
              id="override-reason"
              value={reason}
              onChange={(e) => { setReason(e.target.value); if (reasonError) setReasonError(''); }}
              placeholder="e.g. Student demonstrated the correct approach but made a calculation error in step 3. Partial credit awarded per rubric criterion 2."
              style={{ ...s.input, ...s.textarea, ...(reasonError ? s.inputError : {}) }}
            />
            <div style={s.reasonMeta}>
              {reasonError && <span style={s.fieldError}>{reasonError}</span>}
              <span style={{ ...s.charCount, color: reason.length < 10 ? 'var(--text-muted)' : 'var(--success)' }}>
                {reason.length} chars
              </span>
            </div>
          </div>

          {/* AI grade for reference */}
          <div style={s.refBox}>
            <span style={s.refLabel}>AI justification (for reference)</span>
            <span style={s.refText}>
              {grade?.justification || <em style={{ color: 'var(--text-muted)' }}>No justification available</em>}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            style={{ ...s.confirmBtn, opacity: (!isValidScore || submitting) ? 0.5 : 1 }}
            onClick={handleConfirm}
            disabled={!isValidScore || submitting}
          >
            {submitting ? 'Saving…' : `Override → ${score} pts`}
          </button>
        </div>
      </div>
    </>
  );
};

const s = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
    zIndex: 200,
  },
  modal: {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 201,
    width: '100%', maxWidth: 520,
    background: 'var(--bg-2)',
    border: '1px solid var(--border-hi)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex', flexDirection: 'column',
    maxHeight: '90vh', overflow: 'hidden',
  },

  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    padding: '18px 20px', borderBottom: '1px solid var(--border)',
  },
  titleLabel: { fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  subtitle: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 },
  closeBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    fontSize: 14, cursor: 'pointer', padding: '2px 6px', flexShrink: 0,
  },

  body: { padding: 20, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' },

  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-secondary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' },
  required: { color: 'var(--error)' },

  scoreRow: { display: 'flex', alignItems: 'center', gap: 10 },
  input: {
    background: 'var(--bg-3)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', borderRadius: 'var(--radius-md)',
    padding: '10px 12px', fontSize: 14, fontFamily: 'var(--font-sans)', outline: 'none', width: '100%',
  },
  scoreInput: { width: 80, textAlign: 'center', fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700 },
  inputError: { borderColor: 'rgba(239,68,68,0.5)' },
  scoreSep: { fontSize: 18, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  maxScore: { fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)' },

  quickBtns: { display: 'flex', gap: 6, marginLeft: 8 },
  quickBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
    background: 'var(--bg-3)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)',
    padding: '4px 10px', cursor: 'pointer',
  },

  textarea: { minHeight: 100, resize: 'vertical' },
  reasonMeta: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  fieldError: { fontSize: 11, color: '#fca5a5' },
  charCount: { fontSize: 11, fontFamily: 'var(--font-mono)', marginLeft: 'auto' },

  refBox: {
    background: 'var(--bg-3)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: 12,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  refLabel: { fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' },
  refText: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 },

  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '14px 20px', borderTop: '1px solid var(--border)',
  },
  cancelBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)',
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '8px 18px', cursor: 'pointer',
  },
  confirmBtn: {
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
    color: '#000', background: 'var(--accent)',
    border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 20px', cursor: 'pointer',
    letterSpacing: '0.04em',
  },
};

export default OverrideModal;