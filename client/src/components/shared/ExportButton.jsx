import React, { useRef, useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

/**
 * ExportButton — dropdown to export finalized grades as CSV or PDF.
 *
 * Props:
 *   examId: string
 *   disabled: boolean
 */
const ExportButton = ({ examId, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(null); // 'csv' | 'pdf' | null
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = async (format) => {
    setOpen(false);
    setExporting(format);
    try {
      // TODO Phase 2+: const blob = await api.get(`/exams/${examId}/export?format=${format}`, { responseType: 'blob' });
      // Simulate delay
      await new Promise((r) => setTimeout(r, 1200));

      if (format === 'csv') {
        // Mock CSV download
        const csv = 'Student ID,Question,AI Score,TA Score,Status,Justification\nS001,Q1,8,8,approved,"Correct"\n';
        const blob = new Blob([csv], { type: 'text/csv' });
        triggerDownload(blob, `grades-${examId || 'exam'}.csv`);
      } else {
        toast('PDF export requires server — connect the backend first', { icon: 'ℹ' });
        return;
      }

      toast.success(`${format.toUpperCase()} exported`);
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        style={{ ...s.btn, opacity: disabled ? 0.5 : 1 }}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled || !!exporting}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {exporting ? <Spinner /> : '⬇'}
        {exporting ? `Exporting ${exporting.toUpperCase()}…` : 'Export'}
        {!exporting && <span style={s.chevron}>{open ? '▲' : '▼'}</span>}
      </button>

      {open && (
        <div style={s.dropdown} role="menu">
          <button style={s.option} onClick={() => handleExport('csv')} role="menuitem">
            <span style={s.optIcon}>📊</span>
            <div>
              <div style={s.optLabel}>Export CSV</div>
              <div style={s.optDesc}>Grades spreadsheet for LMS upload</div>
            </div>
          </button>
          <button style={s.option} onClick={() => handleExport('pdf')} role="menuitem">
            <span style={s.optIcon}>📄</span>
            <div>
              <div style={s.optLabel}>Export PDF</div>
              <div style={s.optDesc}>Formatted grade report with justifications</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const Spinner = () => (
  <span style={{
    display: 'inline-block', width: 12, height: 12,
    border: '1.5px solid rgba(255,255,255,0.3)', borderTopColor: 'currentColor',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  }} />
);

const s = {
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
    color: 'var(--text-secondary)', background: 'var(--bg-2)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '7px 14px', cursor: 'pointer',
  },
  chevron: { fontSize: 9, color: 'var(--text-muted)' },

  dropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
    background: 'var(--bg-2)', border: '1px solid var(--border-hi)',
    borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
    minWidth: 220, zIndex: 50, overflow: 'hidden',
  },
  option: {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', background: 'none', border: 'none',
    padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
    borderBottom: '1px solid var(--border)',
    transition: 'background .1s',
  },
  optIcon: { fontSize: 18, flexShrink: 0 },
  optLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 },
  optDesc: { fontSize: 11, color: 'var(--text-muted)' },
};

export default ExportButton;