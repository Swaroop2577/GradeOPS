import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { courseService } from '../../services/course.service';
import api from '../../services/api';

const EMPTY_FORM = { name: '', code: '', description: '' };

const CourseManager = ({ courses = [], onCourseCreated, onCourseUpdated }) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((er) => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Course name is required';
    if (!form.code.trim()) errs.code = 'Course code is required';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      const course = await courseService.createCourse(form);
      toast.success(`Course "${form.name}" created`);
      onCourseCreated?.(course);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create course');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.wrapper}>
      {/* Header */}
      <div style={s.topBar}>
        <h2 style={s.title}>Courses</h2>
        <button style={s.newBtn} onClick={() => { setShowForm((v) => !v); setSelectedCourse(null); }}>
          {showForm ? '✕ Cancel' : '+ New Course'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={s.formCard}>
          <h3 style={s.formTitle}>Create New Course</h3>
          <form onSubmit={handleSubmit} style={s.form} noValidate>
            <div style={s.row2}>
              <Field label="Course name" error={errors.name} style={{ flex: 2 }}>
                <input name="name" style={s.input} value={form.name} onChange={handleChange} placeholder="e.g. Introduction to Algorithms" />
              </Field>
              <Field label="Course code" error={errors.code} style={{ flex: '0 0 140px' }}>
                <input name="code" style={{ ...s.input, textTransform: 'uppercase' }} value={form.code} onChange={handleChange} placeholder="e.g. CS301" maxLength={20} />
              </Field>
            </div>
            <Field label="Description (optional)">
              <textarea name="description" style={{ ...s.input, minHeight: 72, resize: 'vertical' }} value={form.description} onChange={handleChange} placeholder="Short description of the course" />
            </Field>
            <div style={s.formActions}>
              <button type="button" style={s.ghostBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" style={s.saveBtn} disabled={saving}>
                {saving ? 'Creating…' : 'Create Course →'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Course list */}
      {courses.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>◈</div>
          <p style={s.emptyText}>No courses yet. Create your first course above.</p>
        </div>
      ) : (
        <div style={s.courseGrid}>
          {courses.map((course) => (
            <CourseCard
              key={course._id}
              course={course}
              selected={selectedCourse?._id === course._id}
              onSelect={() => setSelectedCourse(selectedCourse?._id === course._id ? null : course)}
            />
          ))}
        </div>
      )}

      {/* TA assignment panel */}
      {selectedCourse && (
        <TaPanel
          course={selectedCourse}
          onCourseUpdated={(updated) => {
            onCourseUpdated?.(updated);
            setSelectedCourse(updated);
          }}
        />
      )}
    </div>
  );
};

// ─── TA Assignment Panel ──────────────────────────────────────────────────────
const TaPanel = ({ course, onCourseUpdated }) => {
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);

  const addTa = async () => {
    if (!email.trim()) return;
    setAdding(true);
    try {
      const { data } = await api.post(`/courses/${course._id}/tas`, { email: email.trim() });
      toast.success(`TA added successfully`);
      setEmail('');
      onCourseUpdated?.(data.course);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add TA');
    } finally {
      setAdding(false);
    }
  };

  const removeTa = async (taId) => {
    setRemoving(taId);
    try {
      const { data } = await api.delete(`/courses/${course._id}/tas/${taId}`);
      toast.success('TA removed');
      onCourseUpdated?.(data.course);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove TA');
    } finally {
      setRemoving(null);
    }
  };

  const tas = course.tas || [];

  return (
    <div style={s.taPanel}>
      <div style={s.taPanelHeader}>
        <div style={s.taPanelTitle}>
          Manage TAs — <span style={{ color: 'var(--accent)' }}>{course.code}</span>
        </div>
        <div style={s.taPanelSub}>TAs assigned here will see this course's exams in their review queue.</div>
      </div>

      {/* Add TA by email */}
      <div style={s.addTaRow}>
        <input
          style={{ ...s.input, flex: 1 }}
          placeholder="TA's registered email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTa()}
        />
        <button style={s.saveBtn} onClick={addTa} disabled={adding || !email.trim()}>
          {adding ? 'Adding…' : 'Add TA →'}
        </button>
      </div>

      {/* Current TAs */}
      {tas.length === 0 ? (
        <div style={s.taEmpty}>No TAs assigned yet — add one above.</div>
      ) : (
        <div style={s.taList}>
          {tas.map((ta) => (
            <div key={ta._id} style={s.taRow}>
              <div style={s.taAvatar}>{(ta.name || ta.email || '?')[0].toUpperCase()}</div>
              <div style={s.taInfo}>
                <div style={s.taName}>{ta.name || '—'}</div>
                <div style={s.taEmail}>{ta.email}</div>
              </div>
              <button
                style={s.removeBtn}
                onClick={() => removeTa(ta._id)}
                disabled={removing === ta._id}
              >
                {removing === ta._id ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CourseCard = ({ course, selected, onSelect }) => (
  <div
    style={{ ...s.courseCard, ...(selected ? s.courseCardSelected : {}) }}
    onClick={onSelect}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onSelect()}
  >
    <div style={s.courseCode}>{course.code}</div>
    <div style={s.courseName}>{course.name}</div>
    {course.description && <div style={s.courseDesc}>{course.description}</div>}
    <div style={s.courseMeta}>
      <span>{course.tas?.length ?? 0} TA{(course.tas?.length ?? 0) !== 1 ? 's' : ''}</span>
      <span>·</span>
      <span>{new Date(course.createdAt).toLocaleDateString()}</span>
    </div>
    <div style={{ ...s.manageHint, ...(selected ? { color: 'var(--accent)' } : {}) }}>
      {selected ? '▲ Hide TA panel' : '▼ Manage TAs'}
    </div>
  </div>
);

const Field = ({ label, error, children, style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
    <label style={s.label}>{label}</label>
    {children}
    {error && <span style={s.fieldError}>{error}</span>}
  </div>
);

const s = {
  wrapper:  { display: 'flex', flexDirection: 'column', gap: 20 },
  topBar:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title:    { fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  newBtn:   { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#000', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 16px', cursor: 'pointer' },

  formCard:  { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 },
  formTitle: { fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 },
  form:      { display: 'flex', flexDirection: 'column', gap: 14 },
  row2:      { display: 'flex', gap: 12, flexWrap: 'wrap' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 },

  label:      { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' },
  input:      { background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', padding: '9px 12px', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', width: '100%' },
  fieldError: { fontSize: 12, color: '#fca5a5' },

  ghostBtn: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 14px', cursor: 'pointer' },
  saveBtn:  { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#000', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 18px', cursor: 'pointer' },

  courseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 },
  courseCard: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18, cursor: 'pointer', transition: 'border-color .15s, background .15s', display: 'flex', flexDirection: 'column', gap: 6 },
  courseCardSelected: { borderColor: 'var(--accent)', background: 'var(--accent-bg)' },
  courseCode: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' },
  courseName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  courseDesc: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 },
  courseMeta: { display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 },
  manageHint: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 },

  taPanel:       { background: 'var(--bg-2)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  taPanelHeader: { display: 'flex', flexDirection: 'column', gap: 4 },
  taPanelTitle:  { fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  taPanelSub:    { fontSize: 12, color: 'var(--text-muted)' },
  addTaRow:      { display: 'flex', gap: 10, alignItems: 'center' },

  taList:   { display: 'flex', flexDirection: 'column', gap: 8 },
  taEmpty:  { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '12px 0' },
  taRow:    { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 14px' },
  taAvatar: { width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 },
  taInfo:   { flex: 1, minWidth: 0 },
  taName:   { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  taEmail:  { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  removeBtn:{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', padding: '4px 10px', cursor: 'pointer', flexShrink: 0 },

  empty:     { border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '48px 32px', textAlign: 'center' },
  emptyIcon: { fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--border-hi)', marginBottom: 12 },
  emptyText: { fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
};

export default CourseManager;
