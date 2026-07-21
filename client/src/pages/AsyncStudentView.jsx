import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Mic, Square, UploadCloud } from 'lucide-react';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { Field, Input } from '../components/ui/field.jsx';
import { Panel, PanelHeader } from '../components/ui/panel.jsx';
import {
  createAudioActivityMonitor,
  selectRecordingMimeType,
  uploadAsyncAudio
} from '../lib/audioUpload.js';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function ProcessSection({ title, items = [] }) {
  return (
    <div className="async-process-card rounded-md border p-3">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          {items.map((item, index) => (
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

function AsyncStudentView() {
  const { shareId } = useParams();
  const [session, setSession] = useState(null);
  const [groupNumber, setGroupNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joinedGroup, setJoinedGroup] = useState(null);
  const [report, setReport] = useState(null);
  const [latestTranscript, setLatestTranscript] = useState('');
  const [recordingNotice, setRecordingNotice] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const activityMonitorRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/async/join/${encodeURIComponent(shareId)}`);
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `Unable to load activity (${response.status})`);
        }
        if (!cancelled) {
          setSession(data.session);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Unable to load activity.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  useEffect(() => {
    if (!isRecording) {
      setElapsedSeconds(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRecording]);

  const stopStream = useCallback(() => {
    if (activityMonitorRef.current) {
      void activityMonitorRef.current.close();
      activityMonitorRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // Recorder may already be inactive.
      }
      stopStream();
    };
  }, [stopStream]);

  const joinGroup = async () => {
    setError(null);
    const parsedGroup = Number(groupNumber);
    if (!Number.isInteger(parsedGroup) || parsedGroup <= 0) {
      setError('Enter a valid group number.');
      return;
    }

    try {
      const response = await fetch(`/api/async/join/${encodeURIComponent(shareId)}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupNumber: parsedGroup, displayName })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `Unable to join group (${response.status})`);
      }
      setJoinedGroup(data.group);
      setReport(data.group?.report || null);
    } catch (joinError) {
      setError(joinError.message || 'Unable to join group.');
    }
  };

  const uploadRecording = useCallback(async (blob) => {
    if (!joinedGroup?.groupNumber || !blob?.size) {
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const { payload: data } = await uploadAsyncAudio({
        blob,
        shareId,
        groupNumber: joinedGroup.groupNumber,
        displayName: joinedGroup.displayName || ''
      });
      if (!data.skipped) {
        setRecordingNotice('');
        setLatestTranscript(data.transcript || '');
        setReport(data.report || null);
      }
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload recording.');
    } finally {
      setIsUploading(false);
    }
  }, [joinedGroup, shareId]);

  const startRecording = async () => {
    setError(null);
    if (!joinedGroup?.groupNumber) {
      setError('Join your group before recording.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser does not support microphone recording.');
      return;
    }

    try {
      setRecordingNotice('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activityMonitorRef.current = await createAudioActivityMonitor(stream);
      const mimeType = selectRecordingMimeType(MediaRecorder);
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const recordedType = recorder.mimeType || mimeType || chunksRef.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedType });
        const hasSpeech = activityMonitorRef.current?.hasSpeech() ?? true;
        chunksRef.current = [];
        if (hasSpeech) {
          void uploadRecording(blob);
        } else {
          setRecordingNotice('No speech detected; nothing was uploaded.');
        }
        stopStream();
      };
      streamRef.current = stream;
      recorderRef.current = recorder;
      activityMonitorRef.current?.reset();
      startedAtRef.current = Date.now();
      recorder.start();
      setIsRecording(true);
    } catch (recordError) {
      stopStream();
      setError(recordError.message || 'Unable to access microphone.');
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      return;
    }
    recorderRef.current.stop();
    setIsRecording(false);
  };

  const process = report?.process || {};

  if (isLoading) {
    return <div className="async-mode-page min-h-screen"><div className="page-shell py-10 text-center text-sm text-slate-500">Loading activity...</div></div>;
  }

  return (
    <div className="async-mode-page min-h-screen pb-20">
      <main className="page-shell page-shell--fluid space-y-6 py-6">
        <Panel padding="md">
          <PanelHeader
            icon={Mic}
            title={session?.title || 'Asynchronous discussion'}
            description={session?.isOpen ? 'Use your group phone to record and upload your discussion.' : 'This activity is closed.'}
            actions={session?.expiresAt ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Due {formatDate(session.expiresAt)}</span> : null}
          />
          {session?.instructions ? (
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{session.instructions}</p>
          ) : null}
        </Panel>

        {error ? (
          <Alert tone="danger">
            <p>{error}</p>
          </Alert>
        ) : null}

        {!joinedGroup ? (
          <Panel padding="md">
            <PanelHeader title="Join your group" description="The share link identifies the activity. Your group number identifies your recording." />
            <div className="mt-5 grid gap-4 sm:grid-cols-[10rem_1fr_auto]">
              <Field label="Group number" htmlFor="async-group-number">
                <Input id="async-group-number" inputMode="numeric" value={groupNumber} onChange={(event) => setGroupNumber(event.target.value)} placeholder="1" />
              </Field>
              <Field label="Group name" htmlFor="async-group-name" hint="Optional">
                <Input id="async-group-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Group 1" />
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="primary" onClick={joinGroup} disabled={!session?.isOpen}>
                  <span>Join</span>
                </Button>
              </div>
            </div>
          </Panel>
        ) : (
          <>
            <Panel padding="md">
              <PanelHeader
                title={joinedGroup.displayName || `Group ${joinedGroup.groupNumber}`}
                description={isRecording ? `Recording ${elapsedSeconds}s` : isUploading ? 'Uploading and analysing...' : 'Ready to record'}
                actions={(
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Group {joinedGroup.groupNumber}
                  </span>
                )}
              />
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" variant="primary" onClick={startRecording} disabled={!session?.isOpen || isRecording || isUploading}>
                  <Mic className="h-4 w-4" />
                  <span>Start recording</span>
                </Button>
                <Button type="button" variant="danger" onClick={stopRecording} disabled={!isRecording}>
                  <Square className="h-4 w-4" />
                  <span>Stop and upload</span>
                </Button>
              </div>
            </Panel>

            {recordingNotice ? <Alert tone="primary"><p>{recordingNotice}</p></Alert> : null}

            {latestTranscript ? (
              <Panel padding="md">
                <PanelHeader icon={UploadCloud} title="Latest transcript" description="The newest recording segment that was uploaded." />
                <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{latestTranscript}</p>
              </Panel>
            ) : null}

            {report ? (
              <Panel padding="md">
                <PanelHeader icon={CheckCircle2} title="Feedback and process summary" description={`${report.segmentCount || 0} segment${report.segmentCount === 1 ? '' : 's'} analysed`} />
                <div className="mt-4 space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{report.summary || 'No summary yet.'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Feedback</h3>
                    <p className="mt-2 text-sm text-slate-700">{report.feedback || 'No feedback yet.'}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <ProcessSection title="Ideas formed" items={process.ideasFormed || []} />
                    <ProcessSection title="Ideas rejected" items={process.ideasRejected || []} />
                    <ProcessSection title="Decisions" items={process.decisions || []} />
                    <ProcessSection title="Open questions" items={process.openQuestions || []} />
                  </div>
                </div>
              </Panel>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default AsyncStudentView;
