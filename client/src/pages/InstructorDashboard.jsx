import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import CourseManager from '../components/instructor/CourseManager';
import StatusBadge from '../components/shared/StatusBadge';
import { courseService } from '../services/course.service';
import { examTypeService } from '../services/examType.service';
import api from '../services/api';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'courses',  label: 'Courses'  },
];

const PIPELINE_STEPS = [
  { key: 'uploaded', label: 'Uploaded'   },
  { key: 'ocr',      label: 'OCR'        },
  { key: 'grading',  label: 'AI Grading' },
  { key: 'reviewed', label: 'TA Reviewed'},
];

function statusToIndex(status) {
  const map = { uploaded: 0, ocr: 1, grading: 2, graded: 2, reviewed: 3, exported: 3 };
  return map[status] ?? 0;
}

const PipelineBar = ({ status }) => {
  const activeIdx  = statusToIndex(status);
  const allDoneUpTo = status === 'graded' ? 3 : activeIdx;
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 12 }}>
      {PIPELINE_STEPS.map((step, i) => {
        const done    = i < allDoneUpTo;
        const current = i === activeIdx && status !== 'graded';
        return (
          <div key={step.key} style={{
            flex: 1, padding: '5px 8px', textAlign: 'center', fontSize: 10,
            fontFamily: 'var(--font-mono)', fontWeight: current ? 700 : 400,
            borderRadius: i === 0 ? '4px 0 0 4px' : i === PIPELINE_STEPS.length - 1 ? '0 4px 4px 0' : 0,
            background: done || (status === 'graded' && i <= 2) ? 'var(--accent)' : current ? 'var(--accent-bg)' : 'var(--bg-2)',
            color: done || (status === 'graded' && i <= 2) ? '#000' : current ? 'var(--accent)' : 'var(--text-muted)',
            border: `1px solid ${current ? 'var(--accent)' : 'var(--border)'}`,
            borderLeft: i > 0 ? 'none' : undefined,
          }}>
            {step.label}
          </div>
        );
      })}
    </div>
  );
};

const ExamRow = ({ exam }) => (
  <Link to={`/instructor/exams/${exam._id}`} style={s.examRow}>
    <div style={s.examLeft}>
      <div style={s.examName}>{exam.title}</div>
      <div style={s.examMeta}>
        <span style={s.courseTag}>{exam.course?.code || '—'}</span>
        {exam.examType?.label && (
          <><span style={s.metaDot}>·</span><span style={s.typeTag}>{exam.examType.label}</span></>
        )}
        {exam.studentRollNo && (
          <><span style={s.metaDot}>·</span><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Roll: {exam.studentRollNo}</span></>
        )}
        <span style={s.metaDot}>·</span>
        <span>{new Date(exam.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>
      <PipelineBar status={exam.status} />
    </div>
    <div style={s.examRight}>
      <StatusBadge status={exam.status} />
    </div>
  </Link>
);

const StatCard = ({ label, value, sub, accent }) => (
  <div style={{ ...s.statCard, ...(accent ? { borderColor: 'var(--accent)', background: 'var(--accent-bg)' } : {}) }}>
    <div style={s.statLabel}>{label}</div>
    <div style={{ ...s.statVal, ...(accent ? { color: 'var(--accent)' } : {}) }}>{value}</div>
    {sub && <div style={s.statSub}>{sub}</div>}
  </div>
);

/* ─── Course Card with Exam Types ─────────────────────────────────── */
const CourseCard = ({ course, onRefresh }) => {
  const [examTypes, setExamTypes]   = useState([]);
  const [expanded, setExpanded]     = useState(false);
  const [newLabel, setNewLabel]     = useState('');
  const [adding, setAdding]         = useState(false);
  const [creating, setCreating]     = useState(false);
  const [err, setErr]               = useState('');

  useEffect(() => {
    if (expanded) {
      examTypeService.listExamTypes(course._id).then(setExamTypes).catch(() => {});
    }
  }, [expanded, course._id]);

  const handleCreate = async () => {
    if (!newLabel.trim()) { setErr('Label required'); return; }
    setCreating(true); setErr('');
    try {
      const et = await examTypeService.createExamType(course._id, newLabel.trim());
      setExamTypes((prev) => [...prev, et]);
      setNewLabel(''); setAdding(false);
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={s.courseCard}>
      <div style={s.courseCardHeader} onClick={() => setExpanded((p) => !p)}>
        <div>
          <span style={s.courseCode}>{course.code}</span>
          <span style={s.courseName}>{course.name}</span>
          {course.semester && <span style={s.courseSem}>{course.semester}</span>}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded ? '▲' : '▼'} exam types</span>
      </div>

      {expanded && (
        <div style={s.examTypeList}>
          {examTypes.length === 0 && !adding && (
            <div style={s.emptyTypes}>No exam types yet — add Midterm, Final, etc.</div>
          )}
          {examTypes.map((et) => (
            <Link key={et._id} to={`/instructor/exam-types/${et._id}`} style={s.examTypeRow}>
              <div>
                <span style={s.etLabel}>{et.label}</span>
                <span style={s.etCount}>{et.exams?.length || 0} uploads</span>
                {et.rubric && <span style={s.etRubric}>✓ Rubric set</span>}
                {!et.rubric && <span style={s.etNoRubric}>⚠ No rubric</span>}
              </div>
              <span style={{ color: 'var(--accent)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>Open →</span>
            </Link>
          ))}

          {adding ? (
            <div style={s.addTypeRow}>
              <input
                style={s.addTypeInput}
                placeholder="e.g. Midterm, Final, Quiz 1"
                value={newLabel}
                onChange={(e) => { setNewLabel(e.target.value); setErr(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <button style={s.addTypeConfirm} onClick={handleCreate} disabled={creating}>
                {creating ? '…' : 'Add'}
              </button>
              <button style={s.addTypeCancel} onClick={() => { setAdding(false); setNewLabel(''); setErr(''); }}>
                Cancel
              </button>
              {err && <span style={s.addTypeErr}>{err}</span>}
            </div>
          ) : (
            <button style={s.addTypeBtn} onClick={() => setAdding(true)}>+ Add Exam Type</button>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Main Dashboard ──────────────────────────────────────────────── */
const InstructorDashboard = () => {
  const { user }                    = useAuth();
  const [tab, setTab]               = useState('overview');
  const [courses, setCourses]       = useState([]);
  const [exams, setExams]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const [fetchedCourses, examRes] = await Promise.all([
        courseService.listCourses(),
        api.get('/exams'),
      ]);
      setCourses(fetchedCourses);
      setExams(examRes.data.exams || []);
    } catch (err) {
      setError('Failed to load data. Is the server running?');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const ACTIVE = ['ocr', 'grading'];
    if (!exams.some((e) => ACTIVE.includes(e.status))) return;
    const id = setInterval(() => loadData(true), 8000);
    return () => clearInterval(id);
  }, [exams, loadData]);

  const totalSubmissions = exams.reduce((s, e) => s + (e.totalSubmissions || 0), 0);
  const totalGraded      = exams.reduce((s, e) => s + (e.gradedSubmissions || 0), 0);
  const totalReviewed    = exams.reduce((s, e) => s + (e.reviewedSubmissions || 0), 0);

  if (loading) return <div style={s.center}>Loading…</div>;
  if (error)   return <div style={{ ...s.center, color: '#E24B4A' }}>{error}</div>;

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div style={s.eyebrow}>INSTRUCTOR DASHBOARD</div>
        <h1 style={s.heading}>Welcome back, {user?.name}</h1>
        <p style={s.sub}>Manage courses and exam types, upload papers, track grading.</p>
      </div>

      <div style={s.tabBar}>
        {TABS.map((t) => (
          <button key={t.id} style={{ ...s.tabBtn, ...(tab === t.id ? s.tabBtnActive : {}) }} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <div style={s.statsGrid}>
            <StatCard label="Courses"      value={courses.length}    sub={`${exams.length} total uploads`} />
            <StatCard label="Submissions"  value={totalSubmissions}   sub="across all exams" />
            <StatCard label="AI Graded"    value={totalGraded}        sub={`${totalSubmissions > 0 ? Math.round((totalGraded/totalSubmissions)*100) : 0}% complete`} accent />
            <StatCard label="TA Reviewed"  value={totalReviewed}      sub={`${totalSubmissions > 0 ? Math.round((totalReviewed/totalSubmissions)*100) : 0}% finalized`} />
          </div>

          {/* Course cards with exam types */}
          <div style={s.sectionHeader}>
            <div style={s.sectionTitle}>Courses & Exam Types</div>
            <button style={s.ghostBtn} onClick={() => setTab('courses')}>Manage Courses</button>
          </div>

          {courses.length === 0 ? (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>◈</div>
              <p style={s.emptyText}>No courses yet — create your first course.</p>
              <button style={s.accentBtn} onClick={() => setTab('courses')}>Create Course →</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
              {courses.map((c) => <CourseCard key={c._id} course={c} onRefresh={loadData} />)}
            </div>
          )}

          {/* Recent uploads */}
          {exams.length > 0 && (
            <>
              <div style={s.sectionHeader}>
                <div style={s.sectionTitle}>Recent Paper Uploads</div>
              </div>
              <div style={s.examList}>
                {exams.slice(0, 10).map((exam) => <ExamRow key={exam._id} exam={exam} />)}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'courses' && (
        <CourseManager
          courses={courses}
          onCourseCreated={(c) => setCourses((prev) => [...prev, c])}
          onCourseUpdated={(c) => setCourses((prev) => prev.map((x) => (x._id === c._id ? c : x)))}
        />
      )}
    </div>
  );
};

const s = {
  page:        { padding: 32, maxWidth: 1100, margin: '0 auto' },
  center:      { padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  pageHeader:  { marginBottom: 28 },
  eyebrow:     { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 },
  heading:     { fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' },
  sub:         { color: 'var(--text-secondary)', fontSize: 14, marginTop: 6 },
  tabBar:      { display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 0 },
  tabBtn:      { background: 'none', border: 'none', padding: '8px 16px', fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabBtnActive:{ color: 'var(--accent)', borderBottomColor: 'var(--accent)', fontWeight: 700 },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 },
  statCard:    { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 22px' },
  statLabel:   { fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 },
  statVal:     { fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' },
  statSub:     { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle:  { fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' },
  ghostBtn:    { background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 14px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', cursor: 'pointer' },
  accentBtn:   { background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#000', cursor: 'pointer' },
  emptyState:  { border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '52px 32px', textAlign: 'center' },
  emptyIcon:   { fontSize: 28, color: 'var(--text-muted)', marginBottom: 12 },
  emptyText:   { color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)', marginBottom: 16 },
  examList:    { display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  examRow:     { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', textDecoration: 'none' },
  examLeft:    { flex: 1, minWidth: 0 },
  examRight:   { flexShrink: 0, paddingLeft: 20 },
  examName:    { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' },
  examMeta:    { fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' },
  courseTag:   { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' },
  typeTag:     { background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)' },
  metaDot:     { color: 'var(--border)' },
  // CourseCard
  courseCard:       { border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-1)' },
  courseCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', cursor: 'pointer', background: 'var(--bg-2)', userSelect: 'none' },
  courseCode:       { fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--accent)', marginRight: 10 },
  courseName:       { fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 },
  courseSem:        { fontSize: 11, color: 'var(--text-muted)', marginLeft: 10, fontFamily: 'var(--font-mono)' },
  examTypeList:     { padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 },
  emptyTypes:       { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '8px 0' },
  examTypeRow:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-2)', textDecoration: 'none', cursor: 'pointer' },
  etLabel:          { fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginRight: 10 },
  etCount:          { fontSize: 11, color: 'var(--text-muted)', marginRight: 8 },
  etRubric:         { fontSize: 11, color: '#4ade80', fontFamily: 'var(--font-mono)' },
  etNoRubric:       { fontSize: 11, color: '#fca5a5', fontFamily: 'var(--font-mono)' },
  addTypeRow:       { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  addTypeInput:     { flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', padding: '7px 10px', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', minWidth: 180 },
  addTypeConfirm:   { background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 14px', fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#000', cursor: 'pointer' },
  addTypeCancel:    { background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 14px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', cursor: 'pointer' },
  addTypeErr:       { fontSize: 11, color: '#fca5a5' },
  addTypeBtn:       { background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 14px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', cursor: 'pointer', alignSelf: 'flex-start' },
};

export default InstructorDashboard;
