'use client';
import Link from 'next/link';
import { useState, useEffect, type FormEvent } from 'react';
import type { SearchResponse } from '@/lib/types';

interface CandidateHistory {
  result: Extract<SearchResponse, { kind: 'candidates' }>;
  query: string;
  year: string;
}

interface ParsedSection {
  title: string;
  lines: string[];
  type: 'critical' | 'safe' | 'strategy' | 'notice' | 'general';
}

function parseAiText(text: string): ParsedSection[] {
  const rawLines = text.split('\n');
  const sections: ParsedSection[] = [];
  let current: ParsedSection = { title: '', lines: [], type: 'general' };

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;

    const headerMatch = line.match(/^(?:###?\s*|\*\*\s*|\*\*\d+\.\s*)([^*#]+?)(?:\*\*:?|\s*###)?$/);
    if (headerMatch && (line.startsWith('**') || line.startsWith('#'))) {
      if (current.title || current.lines.length) {
        sections.push(current);
      }
      const title = headerMatch[1].trim().replace(/^[\d.]+\s*/, '');
      const lower = title.toLowerCase();
      let type: ParsedSection['type'] = 'general';
      if (lower.includes('safe') || lower.includes('better') || lower.includes('strong') || lower.includes('highest') || lower.includes('good')) {
        type = 'safe';
      } else if (lower.includes('critical') || lower.includes('urgent') || lower.includes('focus') || lower.includes('below') || lower.includes('weakest') || lower.includes('risk') || lower.includes('shortfall') || lower.includes('attend')) {
        type = 'critical';
      } else if (lower.includes('advice') || lower.includes('strategy') || lower.includes('recommend') || lower.includes('health') || lower.includes('summary')) {
        type = 'strategy';
      } else if (lower.includes('notice') || lower.includes('snapshot')) {
        type = 'notice';
      }
      current = { title, lines: [], type };
    } else {
      current.lines.push(line);
    }
  }
  if (current.title || current.lines.length) {
    sections.push(current);
  }
  return sections;
}

function renderFormattedLine(line: string, keyPrefix: string | number) {
  const isBullet = /^[-*]\s+|\d+\.\s+/.test(line);
  const cleanContent = line.replace(/^[-*]\s+|\d+\.\s+/, '');

  const parts = cleanContent.split(/(\*\*.*?\*\*|\*.*?\*)/g);

  const formatted = parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    return part;
  });

  if (isBullet) {
    return <li key={keyPrefix}>{formatted}</li>;
  }
  return <p key={keyPrefix}>{formatted}</p>;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [candidatesHistory, setCandidatesHistory] = useState<CandidateHistory | null>(null);
  const [copied, setCopied] = useState(false);

  async function search(value = query, searchYear = year, isCandidateSelect = false) {
    setLoading(true);
    if (!isCandidateSelect) {
      setCandidatesHistory(null);
    }
    setResult(null);
    try {
      const response = await fetch('/api/student-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: value, ...(searchYear ? { year: searchYear } : {}) })
      });
      const body: SearchResponse = await response.json();
      setResult(body);
      if (body.kind === 'candidates') {
        setCandidatesHistory({ result: body, query: value, year: searchYear });
      }
    } catch {
      setResult({ kind: 'error', error: 'Unable to connect. Please try your search again.' });
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void search();
  }

  function handleBack() {
    if (candidatesHistory) {
      setResult(candidatesHistory.result);
      setQuery(candidatesHistory.query);
      setYear(candidatesHistory.year);
    } else {
      setResult(null);
      setQuery('');
      setYear('');
    }
  }

  function handleClear() {
    setResult(null);
    setCandidatesHistory(null);
    setQuery('');
    setYear('');
  }

  useEffect(() => {
    function onPopState() {
      if (candidatesHistory) {
        setResult(candidatesHistory.result);
        setQuery(candidatesHistory.query);
        setYear(candidatesHistory.year);
      } else {
        setResult(null);
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [candidatesHistory]);

  const record = result?.kind === 'student' ? result : null;

  return (
    <main>
      <header className="topbar">
        <Link href="/" className="brand" onClick={handleClear}>
          <span className="brand-icon">A</span>Attendance<span className="brand-light"> / Insights</span>
        </Link>
        <span className="top-label">STUDENT ANALYTICS</span>
      </header>

      <section className="heading">
        <div className="eyebrow">YOUR ATTENDANCE, IN FOCUS</div>
        <h1>Student Attendance <span>AI Insights</span></h1>
        <p className="notice">
          <span aria-hidden="true">◷</span> This analysis uses a fixed attendance snapshot and is not real-time.
        </p>
      </section>

      <section className="search-panel" aria-label="Student search">
        <form onSubmit={submit}>
          <div className="search-field">
            <label htmlFor="query">Find a student</label>
            <div className="input-wrapper">
              <input
                id="query"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Registration number, email, or name"
                minLength={2}
                maxLength={120}
                required
                disabled={loading}
              />
              {query && !loading && (
                <button
                  type="button"
                  className="input-clear"
                  onClick={() => {
                    setQuery('');
                    if (!record && !candidatesHistory) setResult(null);
                  }}
                  aria-label="Clear search input"
                  title="Clear input"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <div className="year-field">
            <label htmlFor="year">Year</label>
            <select
              id="year"
              value={year}
              onChange={e => setYear(e.target.value)}
              disabled={loading}
            >
              <option value="">All years</option>
              <option>2nd Year</option>
              <option>3rd Year</option>
            </select>
          </div>
          <button className="primary" disabled={loading}>
            {loading ? 'Analysing…' : 'Search student'}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="hint">Use a full registration number or email for an exact match. Names can be partial.</p>
      </section>

      <div aria-live="polite" aria-busy={loading}>
        {loading && (
          <section className="empty">
            <div className="spinner" />
            <h2>Preparing attendance insights</h2>
            <p>Finding the student and checking the recorded snapshot.</p>
          </section>
        )}

        {result?.kind === 'error' && (
          <div className="error-wrap">
            <div className="error" role="alert">{result.error}</div>
            <button type="button" className="back-btn" onClick={handleClear}>
              <span aria-hidden="true">←</span> Back to search
            </button>
          </div>
        )}

        {result?.kind === 'candidates' && (
          <section className="panel candidates">
            <div className="section-heading">
              <h2>Select a student</h2>
              <div className="heading-actions">
                <span>{result.total} matches</span>
                <button type="button" className="clear-btn" onClick={handleClear}>
                  Clear
                </button>
              </div>
            </div>
            <p>
              Choose the correct record to generate an insight.
              {result.total > 25 ? ' Showing the first 25 matches. Refine your search to narrow the results.' : ''}
            </p>
            {result.candidates.map(s => (
              <button
                key={s.registrationNumber}
                onClick={() => {
                  setQuery(s.registrationNumber);
                  if (typeof window !== 'undefined') {
                    window.history.pushState({ isStudentDetail: true }, '');
                  }
                  void search(s.registrationNumber, year, true);
                }}
              >
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.registrationNumber}</small>
                </span>
                <span>{s.year} →</span>
              </button>
            ))}
          </section>
        )}

        {record && (
          <>
            <div className="back-bar">
              <button
                type="button"
                className="back-btn"
                onClick={handleBack}
                id="back-to-results-btn"
              >
                <span aria-hidden="true">←</span>
                <span>
                  {candidatesHistory
                    ? `Back to results (${candidatesHistory.result.total} students matching "${candidatesHistory.query}")`
                    : 'Back to search'}
                </span>
              </button>
              <button type="button" className="clear-btn" onClick={handleClear} id="new-search-btn">
                New search
              </button>
            </div>

            <section className="student-header">
              <div className="avatar">
                {record.student.name.split(' ').map(s => s[0]).slice(0, 2).join('')}
              </div>
              <div>
                <div className="eyebrow">{record.student.year} · STUDENT RECORD</div>
                <h2>{record.student.name}</h2>
                <p>
                  {record.student.registrationNumber}
                  <span className="separator"> / </span>
                  {record.student.email}
                </p>
              </div>
              <div className="snapshot">
                Snapshot date<strong>{record.snapshotDate}</strong>
              </div>
            </section>

            <div className="metrics-grid">
              <section className="stat main-stat">
                <span>Overall average</span>
                <strong>{record.metrics.average}<small>%</small></strong>
                <span className="status">{record.metrics.status}</span>
              </section>
              <section className="stat">
                <span>Highest attendance</span>
                <strong>{record.student.attendance[record.metrics.highestSubject]}<small>%</small></strong>
                <p>{record.metrics.highestSubjects.join(', ')}</p>
              </section>
              <section className="stat">
                <span>Lowest attendance</span>
                <strong>{record.student.attendance[record.metrics.lowestSubject]}<small>%</small></strong>
                <p>{record.metrics.lowestSubjects.join(', ')}</p>
              </section>
              <section className="stat">
                <span>Subjects needing attention</span>
                <strong>{record.metrics.subjectsBelowThreshold.length}<small> / 4</small></strong>
                <p>Below {record.threshold}% analytical threshold</p>
              </section>
            </div>

            <div className="detail-grid">
              <section className="panel">
                <div className="section-heading">
                  <h2>Subject attendance</h2>
                  <span>RECORDED %</span>
                </div>
                {Object.entries(record.student.attendance).map(([subject, n]) => (
                  <div className="subject" key={subject}>
                    <div>
                      <strong>{subject}</strong>
                      <span>{n}%</span>
                    </div>
                    <div
                      className="track"
                      role="meter"
                      aria-label={`${subject} attendance`}
                      aria-valuenow={n}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={n < record.threshold ? 'fill risk' : 'fill'}
                        style={{ width: `${n}%` }}
                      />
                      <span
                        className="threshold-line"
                        style={{ left: `${record.threshold}%` }}
                      />
                    </div>
                    <small>
                      {n < record.threshold
                        ? `${Number((record.threshold - n).toFixed(2))} percentage points below threshold`
                        : 'At or above threshold'}
                    </small>
                  </div>
                ))}
                <p className="footnote">
                  Marker: {record.threshold}% analytical threshold. This is not an official institutional rule.
                </p>
              </section>

              <section className="panel insight">
                <div className="section-heading">
                  <div>
                    <h2>Attendance Intelligence &amp; Action Plan</h2>
                    <span className="ai-sublabel">Analytical guidance based on recorded snapshot</span>
                  </div>
                  <div className="insight-header-tools">
                    <span className="ai-badge">
                      <span className="ai-sparkle">✨</span>AI ADVISORY
                    </span>
                    {record.aiInsight && (
                      <button
                        type="button"
                        className="copy-insight-btn"
                        onClick={() => {
                          void navigator.clipboard.writeText(record.aiInsight!);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        title="Copy insights to clipboard"
                      >
                        {copied ? '✓ Copied' : '📋 Copy Plan'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Spotlight Cards: What to attend & Better attendance */}
                <div className="spotlight-grid">
                  <div className={`spotlight-card ${record.metrics.subjectsBelowThreshold.length > 0 ? 'priority' : 'safe'}`}>
                    <div className="spotlight-top">
                      <h3 className="spotlight-title">
                        {record.metrics.subjectsBelowThreshold.length > 0 ? '🚨 Subjects to Attend Next' : '🎯 Priority Attendance Focus'}
                      </h3>
                      <span className="spotlight-tag">
                        {record.metrics.subjectsBelowThreshold.length > 0 ? 'Urgent Attention' : 'On Track'}
                      </span>
                    </div>

                    {record.metrics.subjectsBelowThreshold.length > 0 ? (
                      <>
                        {record.metrics.subjectsBelowThreshold.map(s => (
                          <div key={s.subject} className="spotlight-subject-row">
                            <div>
                              <span className="spotlight-sub-name">{s.subject}</span>
                              <span className="spotlight-sub-val">{s.attendance}% recorded</span>
                            </div>
                            <span className="badge-shortfall">-{s.shortfall}% below {record.threshold}%</span>
                          </div>
                        ))}
                        <p className="spotlight-guidance">
                          <strong>Immediate Action:</strong> Attend all upcoming lectures in{' '}
                          {record.metrics.subjectsBelowThreshold.map(s => s.subject).join(', ')} to bring attendance back above the {record.threshold}% threshold.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="spotlight-subject-row">
                          <div>
                            <span className="spotlight-sub-name">{record.metrics.lowestSubject}</span>
                            <span className="spotlight-sub-val">{record.student.attendance[record.metrics.lowestSubject]}% (Lowest)</span>
                          </div>
                          <span className="badge-buffer">+{Number((record.student.attendance[record.metrics.lowestSubject] - record.threshold).toFixed(2))}% safe margin</span>
                        </div>
                        <p className="spotlight-guidance">
                          <strong>All subjects meet the {record.threshold}% threshold!</strong> Prioritise {record.metrics.lowestSubject} classes to avoid slipping below threshold.
                        </p>
                      </>
                    )}
                  </div>

                  <div className="spotlight-card safe">
                    <div className="spotlight-top">
                      <h3 className="spotlight-title">🛡️ Better Attendance (Safe Zone)</h3>
                      <span className="spotlight-tag">High Attendance</span>
                    </div>

                    {record.metrics.highestSubjects.map(subj => {
                      const att = record.student.attendance[subj];
                      const buffer = Number((att - record.threshold).toFixed(2));
                      return (
                        <div key={subj} className="spotlight-subject-row">
                          <div>
                            <span className="spotlight-sub-name">{subj}</span>
                            <span className="spotlight-sub-val">{att}% recorded</span>
                          </div>
                          <span className="badge-buffer">+{buffer}% buffer</span>
                        </div>
                      );
                    })}
                    <p className="spotlight-guidance">
                      <strong>Strongest Performance:</strong> Attendance in {record.metrics.highestSubjects.join(', ')} is solid. Maintain your current regular attendance routine here.
                    </p>
                  </div>
                </div>

                {/* Formatted AI Narrative Sections */}
                {record.aiInsight ? (
                  <div className="ai-narrative">
                    {parseAiText(record.aiInsight).map((sec, i) => {
                      const icon = sec.type === 'critical' ? '🚨' : sec.type === 'safe' ? '🛡️' : sec.type === 'strategy' ? '💡' : '📌';
                      return (
                        <div key={i} className={`ai-section-box ${sec.type}`}>
                          {sec.title && (
                            <div className="ai-sec-header">
                              <span className="ai-sec-icon">{icon}</span>
                              <span>{sec.title}</span>
                            </div>
                          )}
                          <div className="ai-sec-content">
                            {sec.lines.some(l => /^[-*]\s+|\d+\.\s+/.test(l)) ? (
                              <ul>
                                {sec.lines.map((line, li) => renderFormattedLine(line, `${i}-${li}`))}
                              </ul>
                            ) : (
                              sec.lines.map((line, li) => renderFormattedLine(line, `${i}-${li}`))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <div className="ai-unavailable">{record.aiError}</div>
                    <div className="ai-section-box strategy">
                      <div className="ai-sec-header">
                        <span className="ai-sec-icon">📌</span>
                        <span>Snapshot Priorities</span>
                      </div>
                      <div className="ai-sec-content">
                        <p>
                          {record.metrics.subjectsBelowThreshold.length
                            ? `Prioritise ${record.metrics.subjectsBelowThreshold
                                .map(s => `${s.subject} (${s.shortfall} percentage points below threshold)`)
                                .join(', ')}.`
                            : 'All recorded subjects meet the configured threshold. Continue attending scheduled sessions and reviewing your attendance records.'}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                <div className="snapshot-note">
                  Based only on the recorded snapshot ({record.snapshotDate}). Future attendance and required class counts cannot be determined from these percentages.
                </div>
              </section>
            </div>

            <p className="status-note">
              Average status bands: Strong ≥85% · Satisfactory ≥75% and &lt;85% · Attendance Risk &lt;75%. Subject alerts use the configured {record.threshold}% threshold.
            </p>
          </>
        )}

        {!loading && !result && (
          <section className="empty">
            <div className="empty-mark" aria-hidden="true">⌕</div>
            <h2>Start with a student</h2>
            <p>
              Search across second- and third-year records to see
              <br className="desktop-break" /> subject attendance, priorities, and a focused AI insight.
            </p>
            <div className="dataset-tags">
              <span>2nd Year · DSA / COA / OS / APP</span>
              <span>3rd Year · CN / Discrete Mathematics / ML / FLA</span>
            </div>
          </section>
        )}
      </div>

      <footer>
        Attendance Insights<span>Snapshot analysis · Synthetic student data</span>
      </footer>
    </main>
  );
}
