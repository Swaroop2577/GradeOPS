import React, { useCallback, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import StatusBadge from '../shared/StatusBadge';
import api from '../../services/api';

const MAX_FILE_SIZE_MB = 50;
const ACCEPTED_TYPES = ['application/pdf'];

const ExamUpload = ({ courseId, onUploadComplete }) => {
  const [files, setFiles] = useState([]);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const validateFile = (file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) return 'Only PDF files are accepted';
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return `File exceeds ${MAX_FILE_SIZE_MB} MB limit`;
    return null;
  };

  const addFiles = (newFiles) => {
    const entries = Array.from(newFiles).map((file) => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      status: 'pending',
      progress: 0,
      error: null,
    }));
    const valid = [];
    entries.forEach((entry) => {
      const err = validateFile(entry.file);
      if (err) toast.error(`${entry.file.name}: ${err}`);
      else valid.push(entry);
    });
    setFiles((prev) => [...prev, ...valid]);
  };

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const onFileInputChange = (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const uploadFile = async (entry) => {
    if (!title.trim()) {
      setTitleError('Exam title is required before uploading');
      return;
    }

    setFiles((prev) =>
      prev.map((f) => f.id === entry.id ? { ...f, status: 'uploading', progress: 0 } : f)
    );

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('courseId', courseId);
      formData.append('examPdf', entry.file);

      const { data } = await api.post('/exams', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded * 100) / e.total) : 50;
          setFiles((prev) =>
            prev.map((f) => f.id === entry.id ? { ...f, progress: pct } : f)
          );
        },
      });

      setFiles((prev) =>
        prev.map((f) => f.id === entry.id ? { ...f, status: 'success', progress: 100 } : f)
      );
      toast.success(`"${entry.file.name}" uploaded successfully`);
      onUploadComplete?.(data.exam);
    } catch (err) {
      const msg = err.response?.data?.message || 'Upload failed';
      setFiles((prev) =>
        prev.map((f) => f.id === entry.id ? { ...f, status: 'error', error: msg } : f)
      );
      toast.error(msg);
    }
  };

  const uploadAll = () => {
    if (!title.trim()) { setTitleError('Exam title is required before uploading'); return; }
    const pending = files.filter((f) => f.status === 'pending');
    if (!pending.length) { toast.error('No files pending upload'); return; }
    pending.forEach(uploadFile);
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const successCount = files.filter((f) => f.status === 'success').length;

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <h2 style={s.title}>Upload Exam</h2>
        <p style={s.sub}>Provide an exam title, then drop the scanned PDF.</p>
      </div>

      {/* Exam title */}
      <div style={s.fieldGroup}>
        <label style={s.label}>Exam Title <span style={{ color: '#fca5a5' }}>*</span></label>
        <input
          style={{ ...s.input, ...(titleError ? { borderColor: '#fca5a5' } : {}) }}
          placeholder="e.g. Midterm Exam — Fall 2026"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleError(''); }}
        />
        {titleError && <span style={s.fieldError}>{titleError}</span>}
      </div>

      {/* Drop zone */}
      <div
        style={{ ...s.dropZone, ...(dragging ? s.dropZoneActive : {}) }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="Upload exam PDFs"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: 'none' }}
          onChange={onFileInputChange}
        />
        <div style={s.dropIcon}>⬆</div>
        <div style={s.dropPrimary}>{dragging ? 'Drop files here' : 'Click or drag PDF files here'}</div>
        <div style={s.dropSub}>PDF only · Max {MAX_FILE_SIZE_MB} MB per file · Multiple files supported</div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={s.fileList}>
          <div style={s.fileListHeader}>
            <span style={s.fileCount}>
              {files.length} file{files.length !== 1 ? 's' : ''} selected
              {successCount > 0 && ` · ${successCount} uploaded`}
            </span>
            {pendingCount > 0 && (
              <button style={s.uploadAllBtn} onClick={uploadAll}>
                Upload {pendingCount} file{pendingCount !== 1 ? 's' : ''} →
              </button>
            )}
          </div>
          {files.map((entry) => (
            <FileRow key={entry.id} entry={entry} onRemove={() => removeFile(entry.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

const FileRow = ({ entry, onRemove }) => {
  const { file, status, progress, error } = entry;
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  return (
    <div style={s.fileRow}>
      <div style={s.fileIcon}>
        {status === 'success' ? '✓' : status === 'error' ? '✗' : '📄'}
      </div>
      <div style={s.fileInfo}>
        <div style={s.fileName}>{file.name}</div>
        <div style={s.fileMeta}>{sizeMB} MB</div>
        {status === 'uploading' && (
          <div style={s.progressBar}>
            <div style={{ ...s.progressFill, width: `${progress}%` }} />
          </div>
        )}
        {error && <div style={s.fileError}>{error}</div>}
      </div>
      <StatusBadge status={status} />
      {(status === 'pending' || status === 'error') && (
        <button style={s.removeBtn} onClick={onRemove} aria-label="Remove file">✕</button>
      )}
    </div>
  );
};

const s = {
  wrapper:   { display: 'flex', flexDirection: 'column', gap: 20 },
  header:    { display: 'flex', flexDirection: 'column', gap: 4 },
  title:     { fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  sub:       { fontSize: 13, color: 'var(--text-secondary)' },

  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label:      { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' },
  input:      { background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', padding: '9px 12px', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', width: '100%' },
  fieldError: { fontSize: 12, color: '#fca5a5' },

  dropZone: {
    border: '1.5px dashed var(--border-hi)', borderRadius: 'var(--radius-lg)',
    padding: '48px 32px', textAlign: 'center', cursor: 'pointer',
    transition: 'border-color .15s, background .15s', background: 'var(--bg-1)',
  },
  dropZoneActive: { borderColor: 'var(--accent)', background: 'var(--accent-bg)' },
  dropIcon:    { fontSize: 28, marginBottom: 12, color: 'var(--text-muted)' },
  dropPrimary: { fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6, fontFamily: 'var(--font-mono)' },
  dropSub:     { fontSize: 12, color: 'var(--text-muted)' },

  fileList:       { border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  fileListHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' },
  fileCount:      { fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' },
  uploadAllBtn:   { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#000', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '6px 14px', cursor: 'pointer' },

  fileRow:   { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' },
  fileIcon:  { fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center', color: 'var(--text-muted)' },
  fileInfo:  { flex: 1, minWidth: 0 },
  fileName:  { fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileMeta:  { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 },
  fileError: { fontSize: 11, color: '#fca5a5', marginTop: 4 },

  progressBar:  { height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width .3s ease' },
  removeBtn:    { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 'var(--radius-sm)', flexShrink: 0 },
};

export default ExamUpload;
