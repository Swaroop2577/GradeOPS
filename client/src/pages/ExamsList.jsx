/**
 * ExamsList.jsx
 * --------------
 * Hierarchy: Course → ExamType folders → individual papers
 * Clicking a Course expands its ExamType folders.
 * Clicking an ExamType navigates to ExamTypeDetail.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { courseService } from '../services/course.service';
import { examTypeService } from '../services/examType.service';

const ExamsList = () => {
  const [courses, setCourses]           = useState([]);
  const [examTypes, setExamTypes]       = useState({}); // courseId → examTypes[]
  const [expanded, setExpanded]         = useState({}); // courseId → bool
  const [loading, setLoading]           = useState(true);
  const [loadingET, setLoadingET]       = useState({}); // courseId → bool
  const navigate = useNavigate();

  useEffect(() => {
    courseService.listCourses()
      .then(cs => { setCourses(cs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const toggleCourse = useCallback(async (courseId) => {
    const isOpen = expanded[courseId];
    setExpanded(p => ({ ...p, [courseId]: !isOpen }));
    if (!isOpen && !examTypes[courseId]) {
      setLoadingET(p => ({ ...p, [courseId]: true }));
      try {
        const ets = await examTypeService.listExamTypes(courseId);
        setExamTypes(p => ({ ...p, [courseId]: ets || [] }));
      } catch {
        setExamTypes(p => ({ ...p, [courseId]: [] }));
      } finally {
        setLoadingET(p => ({ ...p, [courseId]: false }));
      }
    }
  }, [expanded, examTypes]);

  if (loading) return <div style={s.center}>Loading…</div>;

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <div style={s.eyebrow}>ALL EXAMS</div>
          <h1 style={s.heading}>Exams</h1>
          <p style={s.sub}>Browse by course and exam type</p>
        </div>
        <Link to="/instructor" style={s.backBtn}>← Dashboard</Link>
      </div>

      {courses.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>◈</div>
          <p style={s.emptyText}>No courses yet. Create one from the Dashboard first.</p>
          <Link to="/instructor" style={s.accentLink}>Go to Dashboard →</Link>
        </div>
      ) : (
        <div style={s.courseList}>
          {courses.map(course => {
            const isOpen = expanded[course._id];
            const ets    = examTypes[course._id] || [];
            const busy   = loadingET[course._id];

            return (
              <div key={course._id} style={s.courseBlock}>
                {/* Course row */}
                <button style={s.courseRow} onClick={() => toggleCourse(course._id)}>
                  <span style={s.chevron}>{isOpen ? '▾' : '▸'}</span>
                  <span style={s.courseCode}>{course.code}</span>
                  <span style={s.courseName}>{course.name}</span>
                  {ets.length > 0 && (
                    <span style={s.etCount}>{ets.length} exam type{ets.length !== 1 ? 's' : ''}</span>
                  )}
                </button>

                {/* ExamType folders */}
                {isOpen && (
                  <div style={s.etList}>
                    {busy && (
                      <div style={s.etLoading}>Loading exam types…</div>
                    )}
                    {!busy && ets.length === 0 && (
                      <div style={s.etEmpty}>
                        No exam types yet — create one from the Dashboard.
                      </div>
                    )}
                    {!busy && ets.map(et => {
                      const papers     = et.exams || [];
                      const graded     = papers.filter(e => e.status === 'graded').length;
                      const totalSubs  = papers.reduce((s, e) => s + (e.totalSubmissions || 0), 0);
                      const gradedSubs = papers.reduce((s, e) => s + (e.gradedSubmissions || 0), 0);
                      const aiPct      = totalSubs > 0 ? Math.round((gradedSubs / totalSubs) * 100) : 0;

                      return (
                        <Link
                          key={et._id}
                          to={`/instructor/exam-types/${et._id}`}
                          style={s.etRow}
                        >
                          <div style={s.etLeft}>
                            <div style={s.folderIcon}>📁</div>
                            <div>
                              <div style={s.etLabel}>{et.label}</div>
                              <div style={s.etMeta}>
                                {papers.length} paper{papers.length !== 1 ? 's' : ''}
                                {et.rubric ? ' · Rubric set' : ' · No rubric'}
                              </div>
                            </div>
                          </div>
                          <div style={s.etRight}>
                            <StatPill label="Papers"    value={papers.length} />
                            <StatPill label="Graded"    value={`${aiPct}%`} accent />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const StatPill = ({ label, value, accent }) => (
  <div style={{ textAlign: 'center', minWidth: 56 }}>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
  </div>
);

const s = {
  page:       { padding: 32, maxWidth: 1100, margin: '0 auto' },
  center:     { padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 },
  eyebrow:    { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 6 },
  heading:    { fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' },
  sub:        { fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 },
  backBtn:    { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6 },
  courseList: { display: 'flex', flexDirection: 'column', gap: 12 },
  courseBlock:{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  courseRow:  { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: 'var(--bg-2)', border: 'none', cursor: 'pointer', textAlign: 'left' },
  chevron:    { fontSize: 12, color: 'var(--text-muted)', width: 12, flexShrink: 0 },
  courseCode: { fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent)' },
  courseName: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', flex: 1 },
  etCount:    { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', background: 'var(--bg-3)', padding: '2px 8px', borderRadius: 10 },
  etList:     { background: 'var(--bg-1)' },
  etLoading:  { padding: '16px 24px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 },
  etEmpty:    { padding: '16px 24px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12, fontStyle: 'italic' },
  etRow:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 14px 44px', borderTop: '1px solid var(--border)', textDecoration: 'none', background: 'var(--bg-1)', transition: 'background .15s' },
  etLeft:     { display: 'flex', alignItems: 'center', gap: 12 },
  folderIcon: { fontSize: 18 },
  etLabel:    { fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  etMeta:     { fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' },
  etRight:    { display: 'flex', gap: 24, alignItems: 'center' },
  empty:      { border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '52px 32px', textAlign: 'center' },
  emptyIcon:  { fontSize: 28, color: 'var(--text-muted)', marginBottom: 12 },
  emptyText:  { color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)', marginBottom: 16 },
  accentLink: { display: 'inline-block', background: 'var(--accent)', borderRadius: 'var(--radius-sm)', padding: '8px 18px', fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#000', textDecoration: 'none' },
};

export default ExamsList;