/**
 * ExamDetail.jsx
 * ---------------
 * Per-paper detail page. No bulk stats — just this one paper.
 * Tabs: Overview | Rubric | Submissions | Plagiarism
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import StatusBadge from '../components/shared/StatusBadge';
import ExportButton from '../components/shared/ExportButton';
import RubricBuilder from '../components/instructor/RubricBuilder';
import PlagiarismReport from '../components/instructor/PlagiarismReport';
import api from '../services/api';

const TABS = [
  { id: 'overview',    label: 'Overview'    },
  { id: 'rubric',      label: 'Rubric'      },
  { id: 'submissions', label: 'Submissions' },
  { id: 'plagiarism',  label: 'Plagiarism'  },
];

const ExamDetail = () => {
  const { examId } = useParams();
  const [exam,       setExam]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [activeTab,  setActiveTab]  = useState('overview');
  const [triggering, setTriggering] = useState(false);

  const fetchExam = useCallback(async () => {
    try {
      const { data } = await api.get(`/exams/${examId}`);
      setExam(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load exam');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { fetchExam(); }, [fetchExam]);

  // Poll while pipeline is running
  useEffect(() => {
    if (!exam) return;
    if (!['ocr', 'grading'].includes(exam.status)) return;
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get(`/exams/${examId}/status`);
        setExam(prev => ({ ...prev, ...data, status: data.status,
          totalSubmissions:  data.progress?.total    ?? prev.totalSubmissions,
          gradedSubmissions: data.progress?.graded   ?? prev.gradedSubmissions,
          reviewedSubmissions: data.progress?.reviewed ?? prev.reviewedSubmissions,
        }));
        if (!['ocr','grading'].includes(data.status)) clearInterval(timer);
      } catch (_) {}
    }, 5000);
    return () => clearInterval(timer);
  }, [exam?.status, examId]);

  const triggerGrading = async () => {
    if (!exam.rubric) {
      toast.error('Please set up a rubric first');
      setActiveTab('rubric');
      return;
    }
    setTriggering(true);
    try {
      await api.post(`/exams/${examId}/trigger-grading`);
      toast.success('Grading pipeline started!');
      fetchExam();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start pipeline');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) return <div style={s.center}>Loading exam…</div>;
  if (error)   return <div style={{ ...s.center, color: '#E24B4A' }}>{error}</div>;
  if (!exam)   return null;

  const hasRubric   = Boolean(exam.rubric);
  const examTypeCrumb = exam.examType;

  return (
    <div style={s.page}>
      {/* Breadcrumb */}
      <div style={s.breadcrumb}>
        <Link to="/instructor"       style={s.breadLink}>Dashboard</Link>
        <span style={s.breadSep}>›</span>
        {examTypeCrumb ? (
          <>
            <Link to={`/instructor/exam-types/${examTypeCrumb._id || examTypeCrumb}`} style={s.breadLink}>
              {examTypeCrumb.label || 'Exam Type'}
            </Link>
            <span style={s.breadSep}>›</span>
          </>
        ) : (
          <>
            <Link to="/instructor/exams" style={s.breadLink}>Exams</Link>
            <span style={s.breadSep}>›</span>
          </>
        )}
        <span style={s.breadCurrent}>{exam.title}</span>
      </div>

      {/* Header — student info chip + pipeline trigger */}
      <div style={s.header}>
        <div>
          <div style={s.courseTag}>{exam.course?.code} · {exam.course?.name}</div>
          <h1 style={s.examTitle}>{exam.title}</h1>
          {/* Show student info if this is an individual paper */}
          {(exam.studentName || exam.studentRollNo) && (
            <div style={s.studentChips}>
              {exam.studentName       && <Chip icon="👤" label={exam.studentName} />}
              {exam.studentRollNo     && <Chip icon="🪪" label={exam.studentRollNo} />}
              {exam.studentDepartment && <Chip icon="🏫" label={exam.studentDepartment} />}
            </div>
          )}
          <div style={s.headerMeta}>
            <StatusBadge status={exam.status} />
            <span style={s.metaDate}>
              Uploaded {new Date(exam.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {exam.status === 'uploaded' && (
            <button
              style={{ ...s.triggerBtn, ...(!hasRubric ? s.triggerDisabled : {}) }}
              onClick={triggerGrading}
              disabled={triggering || !hasRubric}
              title={!hasRubric ? 'Attach a rubric first' : 'Start grading pipeline'}
            >
              {triggering ? 'Starting…' : '▶ Start Pipeline'}
            </button>
          )}
          <ExportButton examId={exam._id} />
        </div>
      </div>

      {/* Pipeline progress bar */}
      <PipelineBar exam={exam} />

      {/* Tabs */}
      <div style={s.tabRow}>
        {TABS.map(t => (
          <button key={t.id}
            style={{ ...s.tab, ...(activeTab === t.id ? s.tabActive : {}) }}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.id === 'rubric' && !hasRubric && <span style={s.tabWarn}>!</span>}
          </button>
        ))}
      </div>

      <div style={{ paddingTop: 12 }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {exam.pipelineError && (
              <div style={s.errBox}>Pipeline error: {exam.pipelineError}</div>
            )}
            {exam.status === 'uploaded' && !hasRubric && (
              <div style={{ ...s.warnBox, cursor: 'pointer' }} onClick={() => setActiveTab('rubric')}>
                ⚠ No rubric attached — click here or go to the Rubric tab to set one up before grading.
              </div>
            )}
            {exam.status === 'uploaded' && hasRubric && (
              <div style={s.successBox}>
                ✓ Rubric ready — click "Start Pipeline" above to begin.
              </div>
            )}
            {exam.status === 'graded' && (
              <div style={s.successBox}>
                ✓ AI grading complete — review submissions in the Submissions tab.
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {exam.pipelineStartedAt  && `Pipeline started:   ${new Date(exam.pipelineStartedAt).toLocaleString()}`}
              {exam.pipelineCompletedAt && <><br/>Pipeline completed: {new Date(exam.pipelineCompletedAt).toLocaleString()}</>}
            </div>
          </div>
        )}

        {activeTab === 'rubric' && (
          <RubricBuilder
            examId={exam._id}
            examTypeId={null}
            initialRubric={exam.rubric && typeof exam.rubric === 'object' ? exam.rubric : null}
            onSave={() => fetchExam()}
          />
        )}

        {activeTab === 'submissions' && <SubmissionsTab examId={exam._id} />}
        {activeTab === 'plagiarism'  && <PlagiarismReport examId={exam._id} />}
      </div>
    </div>
  );
};

/* ─── Submissions Tab ─────────────────────────────────────────────────── */
const SubmissionsTab = ({ examId }) => {
  const [grades,  setGrades]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [viewing, setViewing] = useState(null); // grade being viewed

  useEffect(() => {
    api.get(`/grades/${examId}`)
      .then(r => setGrades(r.data.grades || []))
      .catch(err => setError(err.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [examId]);

  if (loading) return <div style={s.center}>Loading submissions…</div>;
  if (error)   return <div style={{ color: '#E24B4A', padding: 24, fontFamily: 'var(--font-mono)' }}>{error}</div>;
  if (grades.length === 0) return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
      No submissions graded yet. Start the pipeline from the Overview tab.
    </div>
  );

  return (
    <>
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 140px', padding: '10px 16px', background: 'var(--bg-3)', borderBottom: '1px solid var(--border)' }}>
          {['Question', 'AI Score', 'Status', 'Actions'].map(h => (
            <span key={h} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</span>
          ))}
        </div>
        {grades.map(grade => (
          <div key={grade._id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 140px', padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', background: 'var(--bg-2)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>
              Q{grade.questionId}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
              {grade.aiScore ?? '—'} / {grade.maxScore ?? '—'}
            </span>
            <StatusBadge status={grade.status} />
            <button
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', background: 'none', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', padding: '5px 12px', cursor: 'pointer' }}
              onClick={() => setViewing(grade)}
            >
              View →
            </button>
          </div>
        ))}
      </div>

      {/* Grade detail modal */}
      {viewing && (
        <div style={s.overlay} onClick={() => setViewing(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div>
                <div style={s.modalTitle}>Question {viewing.questionId}</div>
                <div style={s.modalSub}>AI Score: {viewing.aiScore} / {viewing.maxScore}</div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer' }} onClick={() => setViewing(null)}>✕</button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto' }}>
              {viewing.criterionScores?.map(cs => (
                <div key={cs.criterion_id} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{cs.criterion_id}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16 }}>
                    <span style={{ color: 'var(--accent)' }}>{cs.awarded_points}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>/{cs.max_points}</span>
                  </div>
                  {cs.justification && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>{cs.justification}</div>}
                </div>
              ))}
              {viewing.studentFeedback && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 8, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Feedback</div>
                  {viewing.studentFeedback}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* ─── Pipeline bar ──────────────────────────────────────────────────── */
const PipelineBar = ({ exam }) => {
  const stages = [
    { label: 'Uploaded',   done: true },
    { label: 'OCR',        done: ['ocr','grading','graded','reviewed'].includes(exam.status) },
    { label: 'AI Grading', done: ['graded','reviewed'].includes(exam.status) },
    { label: 'TA Review',  done: exam.status === 'reviewed' },
    { label: 'Exported',   done: false },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 20px', overflowX: 'auto' }}>
      {stages.map((st, i) => (
        <React.Fragment key={st.label}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: st.done ? 'var(--accent)' : 'var(--bg-3)', color: st.done ? '#000' : 'var(--text-muted)', border: `1px solid ${st.done ? 'var(--accent)' : 'var(--border)'}`, flexShrink: 0 }}>
              {st.done ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, color: st.done ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{st.label}</span>
          </div>
          {i < stages.length - 1 && <div style={{ flex: 1, height: 1, background: stages[i+1].done ? 'var(--accent)' : 'var(--border)', margin: '0 8px', marginTop: -14 }} />}
        </React.Fragment>
      ))}
    </div>
  );
};

const Chip = ({ icon, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
    {icon} {label}
  </span>
);

const s = {
  page:        { padding: '28px 32px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
  center:      { padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  breadcrumb:  { display: 'flex', alignItems: 'center', gap: 8 },
  breadLink:   { fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'var(--font-mono)' },
  breadSep:    { fontSize: 12, color: 'var(--text-muted)' },
  breadCurrent:{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' },
  header:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  courseTag:   { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 6 },
  examTitle:   { fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 },
  studentChips:{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  headerMeta:  { display: 'flex', alignItems: 'center', gap: 12 },
  metaDate:    { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  triggerBtn:  { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#000', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 18px', cursor: 'pointer' },
  triggerDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  tabRow:      { display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: -1 },
  tab:         { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', borderBottom: '2px solid transparent', color: 'var(--text-muted)', padding: '10px 16px', cursor: 'pointer', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6 },
  tabActive:   { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
  tabWarn:     { background: '#E24B4A', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 },
  errBox:      { background: 'rgba(226,75,74,0.1)', border: '1px solid #E24B4A', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#E24B4A', fontFamily: 'var(--font-mono)' },
  warnBox:     { background: 'rgba(252,165,165,0.08)', border: '1px solid rgba(252,165,165,0.3)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#fca5a5', fontFamily: 'var(--font-mono)' },
  successBox:  { background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--font-mono)' },
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:       { background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' },
  modalTitle:  { fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  modalSub:    { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 },
};

export default ExamDetail;