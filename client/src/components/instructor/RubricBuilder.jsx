import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_RULE = () => ({ id: crypto.randomUUID(), condition: '', points: 1 });

const DEFAULT_CRITERION = () => ({
  id:                   crypto.randomUUID(),
  description:          '',   // criterion name  → schema: description
  detail:               '',   // optional hint   → schema: detail
  max_points:           1,
  partial_credit_rules: [],   // [{ condition, points }] → schema: partial_credit_rules
});

const DEFAULT_QUESTION = () => ({
  id:                   crypto.randomUUID(),
  title:                '',
  max_points:           10,
  notes:                '',   // grader hint     → schema: notes
  allow_partial_credit: true, //                 → schema: allow_partial_credit
  criteria:             [DEFAULT_CRITERION()],
});

// ---------------------------------------------------------------------------
// Backend → frontend mapping
// ---------------------------------------------------------------------------

function mapBackendQuestion(q) {
  return {
    id:                   q._id || q.question_id || q.id || crypto.randomUUID(),
    title:                q.title || '',
    max_points:           q.max_points ?? q.maxPoints ?? 10,
    notes:                q.notes || q.grading_notes || '',
    allow_partial_credit: q.allow_partial_credit ?? q.allowPartialCredit ?? true,
    criteria: (q.criteria || []).map((c) => ({
      id:                   c._id || c.criterion_id || c.id || crypto.randomUUID(),
      description:          c.description || c.label || '',
      detail:               c.detail || '',
      max_points:           c.max_points ?? c.points ?? 1,
      partial_credit_rules: (c.partial_credit_rules || []).map((r) => ({
        id:        r.id || crypto.randomUUID(),
        condition: r.condition || '',
        points:    r.points ?? 0,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Frontend → backend mapping
// ---------------------------------------------------------------------------

function toBackendQuestions(questions) {
  return questions.map((q, qi) => ({
    question_id:          `q${qi + 1}`,
    title:                q.title,
    max_points:           Number(q.max_points) || 0,
    notes:                q.notes || '',
    allow_partial_credit: q.allow_partial_credit,
    criteria: q.criteria.map((c, ci) => ({
      criterion_id:         `q${qi + 1}_c${ci + 1}`,
      description:          c.description || '',
      detail:               c.detail || '',
      max_points:           Number(c.max_points) || 0,
      partial_credit_rules: (c.partial_credit_rules || []).map(({ condition, points }) => ({
        condition,
        points: Number(points) || 0,
      })),
    })),
  }));
}

// ---------------------------------------------------------------------------
// RubricBuilder
// ---------------------------------------------------------------------------

const RubricBuilder = ({ examId, examTypeId, initialRubric = null, onSave }) => {
  // Use examTypeId if provided (ExamType rubric), otherwise fall back to examId (Exam rubric)
  const targetId = examTypeId || examId;
  const [rubricName,      setRubricName]      = useState(initialRubric?.name || '');
  const [questions,       setQuestions]       = useState(
    initialRubric?.questions?.length
      ? initialRubric.questions.map(mapBackendQuestion)
      : [DEFAULT_QUESTION()]
  );
  const [saving,          setSaving]          = useState(false);
  const [finalizing,      setFinalizing]      = useState(false);
  const [expandedQ,       setExpandedQ]       = useState(null);
  const [existingRubricId,setExistingRubricId]= useState(initialRubric?._id || null);
  const [isFinalized,     setIsFinalized]     = useState(initialRubric?.isFinalized || false);
  const [loadingRubric,   setLoadingRubric]   = useState(!initialRubric);

  // ── Load existing rubric ──────────────────────────────────────────────────
  useEffect(() => {
    if (initialRubric || !targetId) { setLoadingRubric(false); return; }
    async function fetchRubric() {
      try {
        const { data } = await api.get(`/rubrics/${targetId}`);
        if (data.rubric) {
          const r = data.rubric;
          setExistingRubricId(r._id);
          setRubricName(r.name || '');
          setIsFinalized(r.isFinalized || false);
          if (r.questions?.length) setQuestions(r.questions.map(mapBackendQuestion));
        }
      } catch (err) {
        if (err.response?.status !== 404) console.error('[RubricBuilder]', err);
      } finally {
        setLoadingRubric(false);
      }
    }
    fetchRubric();
  }, [targetId, initialRubric]);

  // ── Question CRUD ─────────────────────────────────────────────────────────
  const addQuestion = () => {
    const q = DEFAULT_QUESTION();
    setQuestions((qs) => [...qs, q]);
    setExpandedQ(q.id);
  };
  const updateQuestion  = (id, patch) => setQuestions((qs) => qs.map((q) => q.id === id ? { ...q, ...patch } : q));
  const deleteQuestion  = (id) => { setQuestions((qs) => qs.filter((q) => q.id !== id)); setExpandedQ((p) => p === id ? null : p); };

  // ── Criterion CRUD ────────────────────────────────────────────────────────
  const addCriterion    = (qId) => setQuestions((qs) => qs.map((q) => q.id === qId ? { ...q, criteria: [...q.criteria, DEFAULT_CRITERION()] } : q));
  const updateCriterion = (qId, cId, patch) => setQuestions((qs) => qs.map((q) => q.id === qId ? { ...q, criteria: q.criteria.map((c) => c.id === cId ? { ...c, ...patch } : c) } : q));
  const deleteCriterion = (qId, cId) => setQuestions((qs) => qs.map((q) => q.id === qId ? { ...q, criteria: q.criteria.filter((c) => c.id !== cId) } : q));

  // ── Partial credit rule CRUD ──────────────────────────────────────────────
  const addRule    = (qId, cId) => updateCriterion(qId, cId, { partial_credit_rules: [...(questions.find(q=>q.id===qId)?.criteria.find(c=>c.id===cId)?.partial_credit_rules||[]), DEFAULT_RULE()] });
  const updateRule = (qId, cId, rId, patch) => updateCriterion(qId, cId, { partial_credit_rules: questions.find(q=>q.id===qId)?.criteria.find(c=>c.id===cId)?.partial_credit_rules.map(r=>r.id===rId?{...r,...patch}:r) });
  const deleteRule = (qId, cId, rId) => updateCriterion(qId, cId, { partial_credit_rules: questions.find(q=>q.id===qId)?.criteria.find(c=>c.id===cId)?.partial_credit_rules.filter(r=>r.id!==rId) });

  const totalPoints = questions.reduce((s, q) => s + (Number(q.max_points) || 0), 0);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!rubricName.trim()) { toast.error('Rubric name is required'); return; }
    if (questions.find((q) => !q.title.trim())) { toast.error('All questions need a title'); return; }
    setSaving(true);
    try {
      const payload = { name: rubricName, questions: toBackendQuestions(questions) };
      let savedRubric;
      if (existingRubricId) {
        const { data } = await api.put(`/rubrics/${targetId}`, payload);
        savedRubric = data.rubric;
        toast.success('Rubric updated');
      } else {
        const { data } = await api.post('/rubrics', { examId: examTypeId ? null : examId, examTypeId: examTypeId || null, ...payload });
        savedRubric = data.rubric;
        setExistingRubricId(savedRubric._id);
        toast.success('Rubric saved');
      }
      onSave?.(savedRubric);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save rubric');
    } finally {
      setSaving(false);
    }
  };

  // ── Finalize ──────────────────────────────────────────────────────────────
  const handleFinalize = async () => {
    if (!existingRubricId) { toast.error('Save the rubric first before finalizing'); return; }
    if (!window.confirm('Finalize this rubric? It cannot be edited after this.')) return;
    setFinalizing(true);
    try {
      await api.patch(`/rubrics/${targetId}/finalize`);
      setIsFinalized(true);
      toast.success('Rubric finalized — grading can begin');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to finalize');
    } finally {
      setFinalizing(false);
    }
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ name: rubricName, questions: toBackendQuestions(questions), totalPoints }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${rubricName || 'rubric'}.json`; a.click();
  };

  if (loadingRubric) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading rubric…</div>;

  return (
    <div style={s.wrapper}>
      {/* Finalized banner */}
      {isFinalized && (
        <div style={s.finalizedBanner}>
          🔒 This rubric has been finalized. Grading is now active. No further edits allowed.
        </div>
      )}

      {/* Header */}
      <div style={s.topBar}>
        <div style={s.topLeft}>
          <h2 style={s.title}>Rubric Builder</h2>
          <div style={s.totalPill}>{totalPoints} pts total</div>
          {existingRubricId && !isFinalized && <div style={s.savedPill}>✓ Saved to DB</div>}
          {isFinalized && <div style={s.finalizedPill}>🔒 Finalized</div>}
        </div>
        <div style={s.topActions}>
          <button style={s.ghostBtn} onClick={exportJSON}>Export JSON</button>
          {!isFinalized && (
            <>
              <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : existingRubricId ? 'Update Rubric' : 'Save Rubric'}
              </button>
              {existingRubricId && (
                <button style={s.finalizeBtn} onClick={handleFinalize} disabled={finalizing}>
                  {finalizing ? 'Finalizing…' : '🔒 Finalize'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Rubric name */}
      <div style={s.field}>
        <label style={s.label}>Rubric Name</label>
        <input style={s.input} value={rubricName} onChange={(e) => setRubricName(e.target.value)} placeholder="e.g. Midterm Exam — CS301" disabled={isFinalized} />
      </div>

      {/* Questions */}
      <div style={s.questionList}>
        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id} question={q} index={idx}
            expanded={expandedQ === q.id}
            onToggle={() => setExpandedQ((id) => id === q.id ? null : q.id)}
            onUpdate={(patch) => updateQuestion(q.id, patch)}
            onDelete={() => deleteQuestion(q.id)}
            onAddCriterion={() => addCriterion(q.id)}
            onUpdateCriterion={(cId, patch) => updateCriterion(q.id, cId, patch)}
            onDeleteCriterion={(cId) => deleteCriterion(q.id, cId)}
            onAddRule={(cId) => addRule(q.id, cId)}
            onUpdateRule={(cId, rId, patch) => updateRule(q.id, cId, rId, patch)}
            onDeleteRule={(cId, rId) => deleteRule(q.id, cId, rId)}
            disabled={isFinalized}
          />
        ))}
      </div>

      {!isFinalized && (
        <button style={s.addQBtn} onClick={addQuestion}>+ Add Question</button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// QuestionCard
// ---------------------------------------------------------------------------

const QuestionCard = ({ question, index, expanded, onToggle, onUpdate, onDelete, onAddCriterion, onUpdateCriterion, onDeleteCriterion, onAddRule, onUpdateRule, onDeleteRule, disabled }) => {
  const critPoints = question.criteria.reduce((s, c) => s + (Number(c.max_points) || 0), 0);

  return (
    <div style={s.qCard}>
      <div style={s.qHeader}>
        <button style={s.qToggle} onClick={onToggle} aria-expanded={expanded}>
          <span style={{ ...s.chevron, transform: expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
          <span style={s.qNum}>Q{index + 1}</span>
          <span style={s.qTitle}>{question.title || <em style={{ color: 'var(--text-muted)' }}>Untitled question</em>}</span>
        </button>
        <div style={s.qMeta}>
          <span style={s.ptBadge}>{question.max_points} pts</span>
          {!disabled && <button style={s.deleteBtn} onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete question">✕</button>}
        </div>
      </div>

      {expanded && (
        <div style={s.qBody}>
          <div style={s.row2}>
            <div style={{ ...s.field, flex: 2 }}>
              <label style={s.label}>Question title / description</label>
              <input style={s.input} value={question.title} onChange={(e) => onUpdate({ title: e.target.value })} placeholder="e.g. Explain Newton's second law" disabled={disabled} />
            </div>
            <div style={{ ...s.field, flex: '0 0 100px' }}>
              <label style={s.label}>Max pts</label>
              <input style={{ ...s.input, textAlign: 'center' }} type="number" min={0} value={question.max_points} onChange={(e) => onUpdate({ max_points: Number(e.target.value) })} disabled={disabled} />
            </div>
            <div style={{ ...s.field, flex: '0 0 160px' }}>
              <label style={s.label}>Partial credit</label>
              <button
                style={{ ...s.toggleBtn, ...(question.allow_partial_credit ? s.toggleBtnOn : {}) }}
                onClick={() => !disabled && onUpdate({ allow_partial_credit: !question.allow_partial_credit })}
                disabled={disabled}
              >
                {question.allow_partial_credit ? '✓ Allowed' : '✗ Disabled'}
              </button>
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Grading notes (internal — not shown to students)</label>
            <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' }} value={question.notes} onChange={(e) => onUpdate({ notes: e.target.value })} placeholder="Hints, edge cases, or common mistakes for the grader" disabled={disabled} />
          </div>

          {/* Criteria */}
          <div style={s.criteriaSection}>
            <div style={s.criteriaHeader}>
              <span style={s.criteriaTitle}>Scoring Criteria</span>
              <span style={{ ...s.ptBadge, ...(critPoints !== question.max_points ? s.ptBadgeWarn : {}) }}>
                {critPoints} / {question.max_points} pts assigned
              </span>
            </div>

            <div style={s.criterionHeaderRow}>
              <span style={{ width: 18 }} />
              <span style={{ ...s.colHeader, flex: 2 }}>Criterion Name</span>
              <span style={{ ...s.colHeader, flex: 1 }}>Detail (Optional)</span>
              <span style={{ ...s.colHeader, width: 64, textAlign: 'center' }}>Pts</span>
              <span style={{ width: 36 }} />
            </div>

            {question.criteria.map((c, ci) => (
              <CriterionRow
                key={c.id} criterion={c} index={ci}
                allowPartialCredit={question.allow_partial_credit}
                onUpdate={(patch) => onUpdateCriterion(c.id, patch)}
                onDelete={() => onDeleteCriterion(c.id)}
                canDelete={question.criteria.length > 1}
                onAddRule={() => onAddRule(c.id)}
                onUpdateRule={(rId, patch) => onUpdateRule(c.id, rId, patch)}
                onDeleteRule={(rId) => onDeleteRule(c.id, rId)}
                disabled={disabled}
              />
            ))}

            {!disabled && (
              <button style={s.addCriterionBtn} onClick={onAddCriterion}>+ Add criterion</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CriterionRow
// ---------------------------------------------------------------------------

const CriterionRow = ({ criterion, index, allowPartialCredit, onUpdate, onDelete, canDelete, onAddRule, onUpdateRule, onDeleteRule, disabled }) => {
  const [showRules, setShowRules] = useState(criterion.partial_credit_rules?.length > 0);

  return (
    <div style={s.criterionBlock}>
      {/* Main row */}
      <div style={s.criterionRow}>
        <span style={s.criterionIdx}>{index + 1}</span>
        <input style={{ ...s.input, flex: 2 }} value={criterion.description} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="e.g. Correct base case" disabled={disabled} />
        <input style={{ ...s.input, flex: 1 }} value={criterion.detail} onChange={(e) => onUpdate({ detail: e.target.value })} placeholder="Optional detail" disabled={disabled} />
        <input style={{ ...s.input, width: 64, textAlign: 'center', flex: '0 0 64px' }} type="number" min={0} value={criterion.max_points} onChange={(e) => onUpdate({ max_points: Number(e.target.value) })} disabled={disabled} />
        <span style={s.ptsLabel}>pts</span>
        {allowPartialCredit && !disabled && (
          <button
            style={{ ...s.ruleToggleBtn, ...(showRules ? s.ruleToggleBtnOn : {}) }}
            onClick={() => setShowRules((v) => !v)}
            title="Partial credit rules"
          >
            ½
          </button>
        )}
        {canDelete && !disabled ? (
          <button style={s.deleteBtn} onClick={onDelete} aria-label="Delete criterion">✕</button>
        ) : (
          <span style={{ width: 32 }} />
        )}
      </div>

      {/* Partial credit rules panel */}
      {showRules && allowPartialCredit && (
        <div style={s.rulesPanel}>
          <div style={s.rulesHeader}>
            <span style={s.rulesTitle}>Partial Credit Rules</span>
            <span style={s.rulesHint}>Award partial points when a specific condition is met</span>
          </div>

          {criterion.partial_credit_rules?.length === 0 && (
            <div style={s.rulesEmpty}>No rules yet — add one below</div>
          )}

          {(criterion.partial_credit_rules || []).map((rule) => (
            <div key={rule.id} style={s.ruleRow}>
              <span style={s.ruleIf}>IF</span>
              <input
                style={{ ...s.input, flex: 3 }}
                value={rule.condition}
                onChange={(e) => onUpdateRule(rule.id, { condition: e.target.value })}
                placeholder='e.g. "mentions force and acceleration"'
                disabled={disabled}
              />
              <span style={s.ruleThen}>→</span>
              <input
                style={{ ...s.input, width: 60, textAlign: 'center', flex: '0 0 60px' }}
                type="number" min={0} max={criterion.max_points}
                value={rule.points}
                onChange={(e) => onUpdateRule(rule.id, { points: Number(e.target.value) })}
                disabled={disabled}
              />
              <span style={s.ptsLabel}>pts</span>
              {!disabled && (
                <button style={s.deleteBtn} onClick={() => onDeleteRule(rule.id)} aria-label="Delete rule">✕</button>
              )}
            </div>
          ))}

          {!disabled && (
            <button style={s.addRuleBtn} onClick={onAddRule}>+ Add partial credit rule</button>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = {
  wrapper:        { display: 'flex', flexDirection: 'column', gap: 20 },

  finalizedBanner: {
    background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)',
    borderRadius: 'var(--radius-md)', padding: '10px 16px',
    fontSize: 13, color: '#fbbf24', fontFamily: 'var(--font-mono)',
  },

  topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  topLeft:   { display: 'flex', alignItems: 'center', gap: 12 },
  title:     { fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' },
  totalPill: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)' },
  savedPill: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' },
  finalizedPill: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' },
  topActions: { display: 'flex', gap: 10 },

  ghostBtn:    { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 14px', cursor: 'pointer' },
  saveBtn:     { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#000', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '7px 18px', cursor: 'pointer', letterSpacing: '0.04em' },
  finalizeBtn: { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 'var(--radius-sm)', padding: '7px 14px', cursor: 'pointer' },

  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' },
  input: { background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)', padding: '9px 12px', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' },

  questionList: { display: 'flex', flexDirection: 'column', gap: 8 },
  qCard:   { border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-1)' },
  qHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 0' },
  qToggle: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', textAlign: 'left' },
  chevron: { color: 'var(--text-muted)', fontSize: 10, transition: 'transform .2s', flexShrink: 0 },
  qNum:    { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 3, padding: '2px 7px', flexShrink: 0 },
  qTitle:  { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' },
  qMeta:   { display: 'flex', alignItems: 'center', gap: 10 },

  ptBadge:     { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 3, background: 'var(--bg-3)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  ptBadgeWarn: { background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' },
  deleteBtn:   { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 'var(--radius-sm)' },

  qBody: { borderTop: '1px solid var(--border)', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--bg)' },
  row2:  { display: 'flex', gap: 12, flexWrap: 'wrap' },

  toggleBtn:    { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, padding: '9px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-muted)', width: '100%' },
  toggleBtnOn:  { background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' },

  criteriaSection:   { display: 'flex', flexDirection: 'column', gap: 8 },
  criteriaHeader:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 4px' },
  criteriaTitle:     { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' },
  criterionHeaderRow:{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 },
  colHeader:         { fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' },

  criterionBlock: { display: 'flex', flexDirection: 'column', gap: 0 },
  criterionRow:   { display: 'flex', alignItems: 'center', gap: 8 },
  criterionIdx:   { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', width: 18, flexShrink: 0, textAlign: 'right' },
  ptsLabel:       { fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 },

  ruleToggleBtn:   { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, width: 28, height: 28, borderRadius: 4, cursor: 'pointer', background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-muted)', flexShrink: 0 },
  ruleToggleBtnOn: { background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' },

  rulesPanel:  { marginLeft: 26, marginTop: 6, marginBottom: 6, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  rulesHeader: { display: 'flex', alignItems: 'center', gap: 12 },
  rulesTitle:  { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.06em' },
  rulesHint:   { fontSize: 11, color: 'var(--text-muted)' },
  rulesEmpty:  { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' },

  ruleRow:   { display: 'flex', alignItems: 'center', gap: 8 },
  ruleIf:    { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#60a5fa', flexShrink: 0 },
  ruleThen:  { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 },

  addCriterionBtn: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', padding: '8px 16px', cursor: 'pointer', alignSelf: 'flex-start' },
  addRuleBtn:      { fontFamily: 'var(--font-mono)', fontSize: 11, color: '#60a5fa', background: 'none', border: '1px dashed rgba(59,130,246,0.3)', borderRadius: 'var(--radius-md)', padding: '6px 12px', cursor: 'pointer', alignSelf: 'flex-start' },
  addQBtn:         { fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-2)', border: '1px dashed var(--border-hi)', borderRadius: 'var(--radius-lg)', padding: '14px', cursor: 'pointer', width: '100%', letterSpacing: '0.04em' },
};

export default RubricBuilder;