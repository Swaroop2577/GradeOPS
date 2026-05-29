import { useEffect, useCallback } from 'react';

/**
 * KeyboardShortcuts — a headless component that wires keyboard shortcuts
 * for the TA review dashboard.
 *
 * Shortcuts:
 *   A → Approve current grade
 *   R → Reject / open override modal
 *   S → Skip (move to next, leave status unchanged)
 *   N → Next item
 *   P → Previous item
 *   ? → Toggle help overlay (handled by parent via onHelp)
 *
 * Props:
 *   onApprove: fn
 *   onReject: fn
 *   onSkip: fn
 *   onNext: fn
 *   onPrev: fn
 *   onHelp: fn
 *   disabled: boolean  — when true (e.g. modal open) shortcuts are paused
 */
const KeyboardShortcuts = ({
  onApprove,
  onReject,
  onSkip,
  onNext,
  onPrev,
  onHelp,
  disabled = false,
}) => {
  const handler = useCallback(
    (e) => {
      // Never fire when user is typing inside an input / textarea
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (disabled) return;

      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault();
          onApprove?.();
          break;
        case 'r':
          e.preventDefault();
          onReject?.();
          break;
        case 's':
          e.preventDefault();
          onSkip?.();
          break;
        case 'n':
        case 'arrowright':
          e.preventDefault();
          onNext?.();
          break;
        case 'p':
        case 'arrowleft':
          e.preventDefault();
          onPrev?.();
          break;
        case '?':
          e.preventDefault();
          onHelp?.();
          break;
        default:
          break;
      }
    },
    [disabled, onApprove, onReject, onSkip, onNext, onPrev, onHelp]
  );

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);

  return null; // headless — renders nothing
};

export default KeyboardShortcuts;

/* ─── ShortcutHelp overlay component ──────────────────────────────────────── */
const SHORTCUTS = [
  { key: 'A', action: 'Approve grade', color: '#4ade80' },
  { key: 'R', action: 'Reject / Override', color: '#fca5a5' },
  { key: 'S', action: 'Skip for now', color: '#93c5fd' },
  { key: 'N / →', action: 'Next item', color: 'var(--text-secondary)' },
  { key: 'P / ←', action: 'Previous item', color: 'var(--text-secondary)' },
  { key: '?', action: 'Toggle this help', color: 'var(--text-secondary)' },
];

export const ShortcutHelp = ({ onClose }) => (
  <>
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300 }}
      onClick={onClose}
    />
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 301,
      background: 'var(--bg-2)', border: '1px solid var(--border-hi)',
      borderRadius: 'var(--radius-lg)', padding: 24, minWidth: 300,
      boxShadow: 'var(--shadow-lg)',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
        Keyboard shortcuts
      </div>
      {SHORTCUTS.map(({ key, action, color }) => (
        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 10px', color }}>
            {key}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{action}</span>
        </div>
      ))}
      <button
        onClick={onClose}
        style={{ marginTop: 16, width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px', cursor: 'pointer' }}
      >
        Close (Esc)
      </button>
    </div>
  </>
);