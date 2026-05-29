/**
 * ExamTypeDetail.jsx
 * -------------------
 * Shows stats + tabs (Overview | Rubric | Upload Paper | Submissions | Plagiarism)
 * for one ExamType (e.g. "Midterm" under CH419).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import RubricBuilder from '../components/instructor/RubricBuilder';
import StatusBadge from '../components/shared/StatusBadge';
import { examTypeService } from '../services/examType.service';
import api from '../services/api';

const TABS = [
  { id: 'overview',     label: 'Overview'     },
  { id: 'rubric',       label: 'Rubric'       },
  { id: 'upload',       label: 'Upload Paper' },
  { id: 'submissions',  label: 'Submissions'  },
  { id: 'plagiarism',   label: 'Plagiarism'   },
];

/* ─── Upload Paper Form ─────────────────────────────────────────────── */
const UploadPaperForm = ({ examType, onUploaded }) => {
  const [name,      setName]      = useState('');
  const [roll,      setRoll]      = useState('');
  const [dept,      setDept]      = useState('');
  const [file,      setFile]      = useState(null);
  const [errors,    setErrors]    = useState({});
  const [uploading, setUploading] = useState(false);

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Student name is required';
    if (!roll.trim()) e.roll = 'Roll number is required';
    if (!dept.trim()) e.dept = 'Department is required';
    if (!file)        e.file = 'PDF file is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('title',             `${examType.label} — ${roll}`);
      fd.append('courseId',          examType.course._id || examType.course);
      fd.append('examTypeId',        examType._id);
      fd.append('studentName',       name.trim());
      fd.append('studentRollNo',     roll.trim());
      fd.append('studentDepartment', dept.trim());
      fd.append('examPdf',           file);

      const { data } = await api.post('/exams', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Paper uploaded successfully');
      setName(''); setRoll(''); setDept(''); setFile(null);
      onUploaded?.(data.exam);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const Req = () => <span style={{ color: '#fca5a5' }}>*</span>;

  return (
    <div style={s.uploadForm}>
      <div style={s.sectionTitle}>Upload Student Paper</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: -8 }}>
        All three fields are required before the PDF can be uploaded.
      </p>

      {!examType.rubric && (
        <div style={s.warnBox}>
          ⚠ No rubric set. Set it in the <strong>Rubric</strong> tab first — it will be inherited by all uploads.
        </div>
      )}

      <div style={s.fieldsGrid}>
        {[
          { label: 'Student Name', key: 'name', val: name, set: setName, ph: 'e.g. Arjun Mehta' },
          { label: 'Roll Number',  key: 'roll', val: roll, set: setRoll, ph: 'e.g. CH21B042' },
          { label: 'Department',   key: 'dept', val: dept, set: setDept, ph: 'e.g. Chemical Engineering' },
        ].map(({ label, key, val, set, ph }) => (
          <div key={key} style={s.fieldGroup}>
            <label style={s.label}>{label} <Req /></label>
            <input
              style={{ ...s.input, ...(errors[key] ? s.inputErr : {}) }}
              placeholder={ph} value={val}
              onChange={e => { set(e.target.value); setErrors(p => ({ ...p, [key]: '' })); }}
            />
            {errors[key] && <span style={s.errText}>{errors[key]}</span>}
          </div>
        ))}
      </div>

      <div style={s.fieldGroup}>
        <label style={s.label}>Answer PDF <Req /></label>
        <div
          style={{ ...s.dropZone, ...(errors.file ? { borderColor: '#fca5a5' } : {}) }}
          onClick={() => document.getElementById('et-pdf-input')?.click()}
        >
          <input id="et-pdf-input" type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => { setFile(e.target.files[0] || null); setErrors(p => ({ ...p, file: '' })); e.target.value = ''; }} />
          <div style={{ fontSize: 22, marginBottom: 8, color: 'var(--text-muted)' }}>⬆</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: file ? 'var(--accent)' : 'var(--text-primary)' }}>
            {file ? `✓ ${file.name}` : 'Click to select PDF'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>PDF only · Max 50 MB</div>
        </div>
        {errors.file && <span style={s.errText}>{errors.file}</span>}
      </div>

      <button
        style={{ ...s.accentBtn, ...(uploading ? { opacity: 0.6 } : {}) }}
        onClick={handleSubmit} disabled={uploading}
      >
        {uploading ? 'Uploading…' : 'Upload Paper →'}
      </button>
    </div>
  );
};

/* ─── Submissions Tab ───────────────────────────────────────────────── */
const SubmissionsTab = ({ examType, onViewExam }) => {
  const exams = examType.exams || [];

  // Aggregate stats
  const totalPapers   = exams.length;
  const gradedPapers  = exams.filter(e => ['graded','reviewed'].includes(e.status)).length;
  const reviewedPapers= exams.filter(e => e.status === 'reviewed').length;
  const totalSubs     = exams.length;
  const gradedSubs    = exams.filter(e => ['graded','reviewed','exported'].includes(e.status)).length;
  const reviewedSubs  = exams.filter(e => ['reviewed','exported'].includes(e.status)).length;
  const aiPct         = totalSubs > 0 ? Math.round((gradedSubs / totalSubs) * 100) : 0;

  if (exams.length === 0) return (
    <div style={s.empty}>No papers uploaded yet. Go to the <strong>Upload Paper</strong> tab.</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats row */}
      <div style={s.statsGrid}>
        <StatCard label="Papers"      value={totalPapers}   sub={`${gradedPapers} graded`} />
        <StatCard label="AI Graded"   value={`${aiPct}%`}   sub={`${gradedSubs} of ${totalSubs}`} accent />
        <StatCard label="TA Reviewed" value={reviewedSubs}  sub={`${reviewedPapers} fully reviewed`} />
      </div>

      {/* Table */}
      <div style={s.table}>
        <div style={s.tableHeader}>
          {['Roll No', 'Student Name', 'Department', 'Status', 'AI Graded', 'Actions'].map(h => (
            <span key={h} style={s.th}>{h}</span>
          ))}
        </div>
        {exams.map(exam => (
          <div key={exam._id} style={s.tableRow}>
            <span style={s.tdMono}>{exam.studentRollNo || '—'}</span>
            <span style={s.tdText}>{exam.studentName   || '—'}</span>
            <span style={s.tdMuted}>{exam.studentDepartment || '—'}</span>
            <StatusBadge status={exam.status} />
            <span style={s.tdMono}>
              {exam.totalSubmissions > 0 ? `${exam.gradedSubmissions}/${exam.totalSubmissions}` : '—'}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={s.viewBtn} onClick={() => onViewExam(exam)}>View →</button>
              <Link to={`/instructor/exams/${exam._id}`} style={s.detailBtn}>Detail</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── Grade View Modal ──────────────────────────────────────────────── */
const GradeModal = ({ exam, onClose }) => {
  const [grades, setGrades]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/grades/${exam._id}`)
      .then(r => setGrades(r.data.grades || []))
      .catch(() => setGrades([]))
      .finally(() => setLoading(false));
  }, [exam._id]);

  const total = grades.reduce((s, g) => s + (g.aiScore || 0), 0);
  const max   = grades.reduce((s, g) => s + (g.maxScore || 0), 0);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <div>
            <div style={s.modalTitle}>{exam.studentName || exam.title}</div>
            <div style={s.modalSub}>Roll: {exam.studentRollNo} · {exam.studentDepartment}</div>
          </div>
          <button style={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div style={s.modalBody}>
          {loading && <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading grades…</div>}
          {!loading && grades.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              No grades yet — start the pipeline from the paper detail page.
            </div>
          )}
          {!loading && grades.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {grades.map(g => (
                  <div key={g._id} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Question {g.questionId}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>
                      <span style={{ color: 'var(--accent)' }}>{g.aiScore ?? '—'}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>/{g.maxScore}</span>
                    </div>
                    {g.studentFeedback && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 6 }}>{g.studentFeedback}</div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                Total: <strong style={{ color: 'var(--accent)' }}>{total}</strong> / {max}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Plagiarism Tab ────────────────────────────────────────────────── */
const PlagiarismTab = ({ examType }) => {
  const flagged = (examType.exams || []).filter(e => e.plagiarismFlagCount > 0);
  return (
    <div>
      {flagged.length === 0 ? (
        <div style={s.empty}>No plagiarism flags detected across any paper in this exam type.</div>
      ) : (
        <div style={s.table}>
          <div style={{ ...s.tableHeader, gridTemplateColumns: '1fr 1.2fr 1fr 80px' }}>
            {['Roll No', 'Student Name', 'Exam', 'Flags'].map(h => <span key={h} style={s.th}>{h}</span>)}
          </div>
          {flagged.map(e => (
            <div key={e._id} style={{ ...s.tableRow, gridTemplateColumns: '1fr 1.2fr 1fr 80px' }}>
              <span style={s.tdMono}>{e.studentRollNo || '—'}</span>
              <span style={s.tdText}>{e.studentName || '—'}</span>
              <Link to={`/instructor/exams/${e._id}`} style={{ ...s.tdMono, color: 'var(--accent)', textDecoration: 'none' }}>{e.title}</Link>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#fca5a5', fontWeight: 700 }}>{e.plagiarismFlagCount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Main Page ─────────────────────────────────────────────────────── */
const ExamTypeDetail = () => {
  const { examTypeId } = useParams();
  const [examType,   setExamType]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [activeTab,  setActiveTab]  = useState('overview');
  const [viewingExam, setViewingExam] = useState(null);

  // FIX: use a ref so load() never appears in useEffect dependency arrays.
  // Previously load was a useCallback put in dep arrays — every setExamType()
  // call produced a new object reference → React saw a changed dep → re-ran
  // the effect → called load() again → infinite loop regardless of polling.
  const loadRef = useRef(null);
  loadRef.current = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const et = await examTypeService.getExamType(examTypeId);
      setExamType(et);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial load — runs once on mount (examTypeId is stable from useParams)
  useEffect(() => {
    loadRef.current();
  }, [examTypeId]); // eslint-disable-line

  // Poll every 8s ONLY while a pipeline is actively running.
  // Derive a stable primitive so this effect doesn't re-run on every render.
  const activeStatuses = (examType?.exams || [])
    .map(e => e.status)
    .filter(s => ['ocr', 'grading'].includes(s))
    .join(',');

  useEffect(() => {
    if (!activeStatuses) return;
    const interval = setInterval(() => loadRef.current(true), 8000);
    return () => clearInterval(interval);
  }, [activeStatuses]); // no load/loadRef in deps — ref is always current

  // expose a stable reload callback for child components (onSave, onUploaded)
  const load = useCallback(() => loadRef.current(), []);

  if (loading)   return <div style={s.center}>Loading…</div>;
  if (error)     return <div style={{ ...s.center, color: '#E24B4A' }}>{error}</div>;
  if (!examType) return null;

  const exams         = examType.exams || [];
  const hasRubric     = Boolean(examType.rubric);
  const paperCount    = exams.length;

  // Count papers by pipeline stage — use paper count as denominator
  // so stats are always "X of Y papers", not skewed by unprocessed submissions
  const gradedPapers   = exams.filter(e => ['graded','reviewed','exported'].includes(e.status)).length;
  const reviewedPapers = exams.filter(e => ['reviewed','exported'].includes(e.status)).length;
  const aiPct          = paperCount > 0 ? Math.round((gradedPapers  / paperCount) * 100) : 0;
  const reviewPct      = paperCount > 0 ? Math.round((reviewedPapers / paperCount) * 100) : 0;

  // For avg score use the averageScore field on each graded exam
  const gradedExams = exams.filter(e => e.averageScore != null);
  const avgScore    = gradedExams.length > 0
    ? Math.round(gradedExams.reduce((s, e) => s + e.averageScore, 0) / gradedExams.length)
    : null;

  return (
    <div style={s.page}>
      {/* Breadcrumb */}
      <div style={s.breadcrumb}>
        <Link to="/instructor"          style={s.breadLink}>Dashboard</Link>
        <span style={s.breadSep}>›</span>
        <Link to="/instructor/exams"    style={s.breadLink}>Exams</Link>
        <span style={s.breadSep}>›</span>
        <span style={s.breadCurrent}>{examType.label}</span>
      </div>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.courseTag}>{examType.course?.code} · {examType.course?.name}</div>
          <h1 style={s.examTitle}>{examType.label}</h1>
          <div style={s.headerMeta}>
            <span style={hasRubric ? s.rubricOk : s.rubricWarn}>
              {hasRubric ? '✓ Rubric set' : '⚠ No rubric'}
            </span>
            <span style={s.metaDot}>·</span>
            <span style={s.metaText}>{paperCount} paper{paperCount !== 1 ? 's' : ''} uploaded</span>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div style={s.statsGrid}>
        <StatCard label="Papers"      value={paperCount}                       sub={`${exams.filter(e=>e.status==='graded'||e.status==='reviewed').length} graded`} />
        <StatCard label="AI Graded"   value={`${aiPct}%`}                      sub={`${gradedPapers} of ${paperCount} papers graded`} accent />
        <StatCard label="TA Reviewed" value={`${reviewPct}%`}                  sub={`${reviewedPapers} of ${paperCount} papers`} />
        <StatCard label="Avg Score"   value={avgScore != null ? `${avgScore}%` : '—'} sub="across graded papers" highlight />
      </div>

      {/* Tabs */}
      <div style={s.tabRow}>
        {TABS.map(t => (
          <button key={t.id} style={{ ...s.tab, ...(activeTab === t.id ? s.tabActive : {}) }} onClick={() => setActiveTab(t.id)}>
            {t.label}
            {t.id === 'rubric'      && !hasRubric   && <span style={s.tabWarn}>!</span>}
            {t.id === 'submissions' && paperCount > 0 && <span style={s.tabBadge}>{paperCount}</span>}
          </button>
        ))}
      </div>

      <div style={{ paddingTop: 16 }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!hasRubric && (
              <div style={s.warnBox}>
                ⚠ No rubric defined. Set it once in the <strong>Rubric</strong> tab — it will be reused for all papers.
                <button style={{ ...s.accentBtn, marginLeft: 16, padding: '5px 12px', fontSize: 11 }} onClick={() => setActiveTab('rubric')}>Set Rubric →</button>
              </div>
            )}
            {hasRubric && (
              <div style={s.successBox}>
                ✓ Rubric is set (v{examType.rubric?.version}, {examType.rubric?.questions?.length} question{examType.rubric?.questions?.length !== 1 ? 's' : ''}). Upload papers in the <strong>Upload Paper</strong> tab.
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Use the tabs above to manage this exam type: set the rubric once, upload individual student papers, then review AI-graded submissions.
            </div>
          </div>
        )}

        {activeTab === 'rubric' && (
          <RubricBuilder
            examId={null}
            examTypeId={examType._id}
            initialRubric={examType.rubric && typeof examType.rubric === 'object' ? examType.rubric : null}
            onSave={() => load()}
          />
        )}

        {activeTab === 'upload' && (
          <UploadPaperForm
            examType={examType}
            onUploaded={(newExam) => {
              setExamType(prev => ({ ...prev, exams: [newExam, ...(prev.exams || [])] }));
              setActiveTab('submissions');
            }}
          />
        )}

        {activeTab === 'submissions' && (
          <SubmissionsTab examType={examType} onViewExam={setViewingExam} />
        )}

        {activeTab === 'plagiarism' && (
          <PlagiarismTab examType={examType} />
        )}
      </div>

      {/* Grade view modal */}
      {viewingExam && <GradeModal exam={viewingExam} onClose={() => setViewingExam(null)} />}
    </div>
  );
};

const StatCard = ({ label, value, sub, accent, highlight }) => (
  <div style={{ background: (accent || highlight) ? 'var(--accent-bg)' : 'var(--bg-2)', border: `1px solid ${(accent || highlight) ? 'var(--accent-border)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: (accent || highlight) ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: (accent || highlight) ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);

const s = {
  page:        { padding: '28px 32px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
  center:      { padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  breadcrumb:  { display: 'flex', alignItems: 'center', gap: 8 },
  breadLink:   { fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'var(--font-mono)' },
  breadSep:    { fontSize: 12, color: 'var(--text-muted)' },
  breadCurrent:{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' },
  header:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  courseTag:   { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 6 },
  examTitle:   { fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 },
  headerMeta:  { display: 'flex', alignItems: 'center', gap: 8 },
  rubricOk:    { fontSize: 12, color: '#4ade80', fontFamily: 'var(--font-mono)' },
  rubricWarn:  { fontSize: 12, color: '#fca5a5', fontFamily: 'var(--font-mono)' },
  metaDot:     { color: 'var(--border)' },
  metaText:    { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  statsGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 14 },
  tabRow:      { display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: -1 },
  tab:         { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', borderBottom: '2px solid transparent', color: 'var(--text-muted)', padding: '10px 16px', cursor: 'pointer', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6 },
  tabActive:   { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
  tabWarn:     { background: '#E24B4A', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 },
  tabBadge:    { background: 'var(--bg-3)', color: 'var(--text-muted)', borderRadius: 8, padding: '1px 6px', fontSize: 10, fontFamily: 'var(--font-mono)' },
  warnBox:     { background: 'rgba(252,165,165,0.08)', border: '1px solid rgba(252,165,165,0.3)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#fca5a5', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  successBox:  { background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--font-mono)' },
  empty:       { border: '1px dashed var(--border)', borderRadius: 8, padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 },
  accentBtn:   { background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#000', cursor: 'pointer' },
  sectionTitle:{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  uploadForm:  { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: '100%' },
  fieldsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 16 },
  fieldGroup:  { display: 'flex', flexDirection: 'column', gap: 6 },
  label:       { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' },
  input:       { background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' },
  inputErr:    { borderColor: '#fca5a5' },
  errText:     { fontSize: 11, color: '#fca5a5' },
  dropZone:    { border: '1.5px dashed var(--border-hi)', borderRadius: 'var(--radius-lg)', padding: '32px 24px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-1)' },
  table:       { border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  tableHeader: { display: 'grid', gridTemplateColumns: '0.8fr 1fr 1.2fr 1.2fr 1.3fr 0.5fr', padding: '10px 16px', background: 'var(--bg-3)', borderBottom: '1px solid var(--border)', gap: 18 },
  tableRow:    { display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr 1.8fr 0.5fr 1.5fr', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', alignItems: 'center', gap: 38 },
  th:          { fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' },
  tdMono:      { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' },
  tdText:      { fontSize: 13, color: 'var(--text-primary)' },
  tdMuted:     { fontSize: 12, color: 'var(--text-muted)' },
  viewBtn:     { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', cursor: 'pointer' },
  detailBtn:   { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', cursor: 'pointer', textDecoration: 'none' },
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:       { background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' },
  modalTitle:  { fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  modalSub:    { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 },
  modalClose:  { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer' },
  modalBody:   { padding: 20, overflowY: 'auto', flex: 1 },
};

export default ExamTypeDetail;