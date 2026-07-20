import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, Clock3, ExternalLink, RefreshCw, Share2 } from 'lucide-react';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { Field, Input, Textarea } from '../components/ui/field.jsx';
import { Panel, PanelHeader, SectionHeader } from '../components/ui/panel.jsx';

const DEFAULT_INSTRUCTIONS = [
  'Record your group discussion outside class.',
  'Say the ideas you considered, the alternatives you rejected, and the decision you reached.',
  'Use specific evidence from the task, not only final answers.'
].join(' ');

function formatDate(value) {
  if (!value) return 'No deadline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function ProcessList({ title, items = [] }) {
  return (
    <div className="async-process-card rounded-md border p-3">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          {items.slice(0, 4).map((item, index) => (
            <li key={`${title}-${index}`}>
              <span>{item.text}</span>
              {item.timestamp ? <span className="ml-2 text-xs text-slate-500">{formatDate(item.timestamp)}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No evidence yet.</p>
      )}
    </div>
  );
}

function GroupReport({ group }) {
  const process = group.report?.process || {};
  return (
    <Panel padding="md" tone="outline">
      <PanelHeader
        title={group.displayName || `Group ${group.groupNumber}`}
        description={`${group.report?.segmentCount || 0} uploaded segment${group.report?.segmentCount === 1 ? '' : 's'}`}
        actions={<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Group {group.groupNumber}</span>}
      />

      {group.report ? (
        <div className="mt-4 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Summary</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{group.report.summary || 'No summary yet.'}</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Feedback</h4>
            <p className="mt-2 text-sm text-slate-700">{group.report.feedback || 'No feedback yet.'}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ProcessList title="Ideas formed" items={process.ideasFormed || []} />
            <ProcessList title="Ideas rejected" items={process.ideasRejected || []} />
            <ProcessList title="Decisions" items={process.decisions || []} />
            <ProcessList title="Open questions" items={process.openQuestions || []} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">This group has joined, but no recording has been uploaded yet.</p>
      )}
    </Panel>
  );
}

function AsyncDashboard() {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [title, setTitle] = useState('Asynchronous group discussion');
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [feedbackPrompt, setFeedbackPrompt] = useState('Summarise the discussion and give feedback on the quality of reasoning, collaboration, rejected ideas, and final decision.');
  const [maxGroupNumber, setMaxGroupNumber] = useState(12);
  const [expiresAt, setExpiresAt] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) || sessions[0] || null,
    [selectedId, sessions]
  );

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/async/sessions');
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Failed to load async sessions (${response.status})`);
      }
      setSessions(data.sessions || []);
      if (!selectedId && data.sessions?.[0]?.id) {
        setSelectedId(data.sessions[0].id);
      }
    } catch (error) {
      setFeedback({ type: 'danger', message: error.message || 'Unable to load async sessions.' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const createSession = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/async/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          instructions,
          feedbackPrompt,
          maxGroupNumber: Number(maxGroupNumber),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Failed to create async session (${response.status})`);
      }
      setSessions((previous) => [data.session, ...previous]);
      setSelectedId(data.session.id);
      setFeedback({ type: 'success', message: 'Async activity created. Share the link with students.' });
    } catch (error) {
      setFeedback({ type: 'danger', message: error.message || 'Unable to create async activity.' });
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (session, status) => {
    if (!session) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/async/sessions/${session.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Failed to update session (${response.status})`);
      }
      setSessions((previous) => previous.map((item) => (item.id === data.session.id ? data.session : item)));
    } catch (error) {
      setFeedback({ type: 'danger', message: error.message || 'Unable to update activity.' });
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = async () => {
    if (!selectedSession?.joinUrl) return;
    await navigator.clipboard?.writeText(selectedSession.joinUrl);
    setFeedback({ type: 'success', message: 'Share link copied.' });
  };

  return (
    <div className="async-mode-page min-h-screen pb-20">
      <main className="page-shell page-shell--fluid stack py-6">
        <SectionHeader
          eyebrow="Teacher workspace"
          title="Asynchronous discussion"
          description="Create an obfuscated student recording link, collect group audio outside class, and review the reasoning process behind the final answer."
          actions={(
            <Button type="button" size="sm" variant="secondary" onClick={loadSessions} disabled={isLoading}>
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </Button>
          )}
        />

        {feedback ? (
          <Alert tone={feedback.type}>
            <p>{feedback.message}</p>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(20rem,28rem)_1fr]">
          <Panel padding="md">
            <PanelHeader
              icon={Clock3}
              title="Create activity"
              description="The student link uses a random share ID, not the classroom session code."
            />
            <div className="mt-5 space-y-4">
              <Field label="Title" htmlFor="async-title">
                <Input id="async-title" value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="Student instructions" htmlFor="async-instructions">
                <Textarea id="async-instructions" rows={6} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
              </Field>
              <Field label="Feedback prompt" htmlFor="async-feedback">
                <Textarea id="async-feedback" rows={5} value={feedbackPrompt} onChange={(event) => setFeedbackPrompt(event.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Max groups" htmlFor="async-max-groups">
                  <Input id="async-max-groups" type="number" min="1" max="99" value={maxGroupNumber} onChange={(event) => setMaxGroupNumber(event.target.value)} />
                </Field>
                <Field label="Deadline" htmlFor="async-deadline" hint="Optional">
                  <Input id="async-deadline" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
                </Field>
              </div>
              <Button type="button" variant="primary" onClick={createSession} disabled={isLoading || !instructions.trim()}>
                <Share2 className="h-4 w-4" />
                <span>Create share link</span>
              </Button>
            </div>
          </Panel>

          <div className="space-y-6">
            <Panel padding="md">
              <PanelHeader
                title={selectedSession ? selectedSession.title : 'No async activity selected'}
                description={selectedSession ? `${selectedSession.status === 'open' ? 'Open' : 'Closed'} · ${formatDate(selectedSession.expiresAt)}` : 'Create an activity to generate a student link.'}
                actions={selectedSession ? (
                  <>
                    <Button type="button" size="sm" variant="secondary" onClick={copyLink}>
                      <Clipboard className="h-4 w-4" />
                      <span>Copy link</span>
                    </Button>
                    <Button type="button" size="sm" variant="ghost" asChild>
                      <a href={selectedSession.joinUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        <span>Open</span>
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={selectedSession.status === 'open' ? 'danger' : 'secondary'}
                      onClick={() => updateStatus(selectedSession, selectedSession.status === 'open' ? 'closed' : 'open')}
                    >
                      <span>{selectedSession.status === 'open' ? 'Close' : 'Reopen'}</span>
                    </Button>
                  </>
                ) : null}
              />

              {sessions.length > 1 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {sessions.map((session) => (
                    <Button
                      key={session.id}
                      type="button"
                      size="sm"
                      variant={session.id === selectedSession?.id ? 'primary' : 'secondary'}
                      onClick={() => setSelectedId(session.id)}
                    >
                      <span>{session.title}</span>
                    </Button>
                  ))}
                </div>
              ) : null}

              {selectedSession?.joinUrl ? (
                <div className="async-share-box mt-4 rounded-md border p-3 text-sm text-slate-700">
                  <p className="break-all font-mono">{selectedSession.joinUrl}</p>
                </div>
              ) : null}
            </Panel>

            <div className="space-y-4">
              {selectedSession?.groups?.length ? (
                selectedSession.groups.map((group) => <GroupReport key={group.id} group={group} />)
              ) : (
                <Panel padding="lg" tone="subtle">
                  <p className="text-center text-sm text-slate-500">Student groups will appear here after they open the link and upload a recording.</p>
                </Panel>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default AsyncDashboard;
