import { useCallback, useEffect, useRef } from 'react';

/**
 * useKeyboardNav — wires all keyboard shortcuts for the TA review dashboard.
 *
 * Handles:
 *   A           → approve current grade
 *   R           → reject / open override modal
 *   S           → skip (advance without acting)
 *   N / →       → next item
 *   P / ←       → previous item
 *   ?           → toggle shortcut help overlay
 *   Escape      → close any open modal
 *
 * Rules:
 *   - Never fires while the user is typing in an input / textarea / select
 *   - Paused entirely when `disabled` is true (e.g. modal is open)
 *   - All callbacks are optional — missing ones are safely ignored
 *
 * Usage:
 *   useKeyboardNav({
 *     onApprove, onReject, onSkip, onNext, onPrev, onHelp, onEscape,
 *     disabled: showOverrideModal,
 *   });
 *
 * @param {object}   options
 * @param {function} [options.onApprove]
 * @param {function} [options.onReject]
 * @param {function} [options.onSkip]
 * @param {function} [options.onNext]
 * @param {function} [options.onPrev]
 * @param {function} [options.onHelp]
 * @param {function} [options.onEscape]
 * @param {boolean}  [options.disabled=false]
 */
const useKeyboardNav = ({
  onApprove,
  onReject,
  onSkip,
  onNext,
  onPrev,
  onHelp,
  onEscape,
  disabled = false,
} = {}) => {
  // Keep latest callbacks in a ref so the event listener never goes stale
  // without needing to re-register itself on every render.
  const cbRef = useRef({});
  cbRef.current = { onApprove, onReject, onSkip, onNext, onPrev, onHelp, onEscape };

  const handler = useCallback((e) => {
    // Skip if user is typing inside a form element
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Skip if shortcuts are paused (e.g. a modal is open)
    if (disabled) {
      // Still allow Escape to close whatever is open
      if (e.key === 'Escape') {
        e.preventDefault();
        cbRef.current.onEscape?.();
      }
      return;
    }

    const { onApprove, onReject, onSkip, onNext, onPrev, onHelp, onEscape } = cbRef.current;

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

      case 'escape':
        e.preventDefault();
        onEscape?.();
        break;

      default:
        break;
    }
  }, [disabled]); // only re-create when disabled changes; callbacks come from ref

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
};

export default useKeyboardNav;


/* ─── Shortcut map (exported for use in help overlays) ────────────────────── */
export const SHORTCUT_MAP = [
  { key: 'A',     description: 'Approve grade',        color: '#4ade80' },
  { key: 'R',     description: 'Reject / Override',    color: '#fca5a5' },
  { key: 'S',     description: 'Skip for now',         color: '#93c5fd' },
  { key: 'N / →', description: 'Next item',            color: 'var(--text-secondary)' },
  { key: 'P / ←', description: 'Previous item',        color: 'var(--text-secondary)' },
  { key: '?',     description: 'Toggle shortcut help', color: 'var(--text-secondary)' },
  { key: 'Esc',   description: 'Close modal',          color: 'var(--text-secondary)' },
];