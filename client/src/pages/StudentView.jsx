import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStudentSocket } from '../hooks/useStudentSocket';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { StudentHeader } from '../features/student/components/StudentHeader';
import { JoinForm } from '../features/student/components/JoinForm';
import { TranscriptionPanel } from '../features/student/components/TranscriptionPanel';
import { SummaryPanel } from '../features/student/components/SummaryPanel';
import { ChecklistPanel } from '../features/student/components/ChecklistPanel';
import { extractSessionCodeFromJoinToken } from '../lib/joinToken.js';
import { Alert } from '../components/ui/alert.jsx';

function StudentView() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const blockedTeacherAccess = params.get('blocked') === 'teacher';
  const joinToken = String(params.get('token') || '').trim();
  const initialCode = extractSessionCodeFromJoinToken(joinToken) || String(params.get('code') || '').trim().toUpperCase();
  const initialGroup = String(params.get('group') || '').trim();
  const {
    socket,
    isConnected,
    sessionInfo,
    transcription,
    summary,
    checklist,
    checklistReleased,
    error: socketError,
    recordingState,
    joinSession
  } = useStudentSocket(joinToken);

  const [uploadError, setUploadError] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const {
    isRecording,
    startRecording,
    stopRecording,
    isPageVisible,
    uploadState
  } = useAudioRecorder(
    sessionInfo.code,
    sessionInfo.group,
    socket,
    setUploadError,
    joinToken
  );

  // Handle recording state from socket
  useEffect(() => {
    if (recordingState.isRecording && !isRecording) {
      setUploadError(null);
      startRecording(recordingState.interval);
    } else if (!recordingState.isRecording && isRecording) {
      stopRecording();
    }
  }, [recordingState, isRecording, startRecording, stopRecording]);

  // Elapsed timer
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Auto-join from URL params
  useEffect(() => {
    if ((initialCode || joinToken) && initialGroup && !sessionInfo.code) {
      joinSession(initialCode, initialGroup);
    }
  }, [initialCode, initialGroup, joinSession, joinToken, sessionInfo.code]);

  if (!sessionInfo.code) {
    return (
      <JoinForm
        onJoin={joinSession}
        error={socketError}
        initialCode={initialCode}
        initialGroup={initialGroup}
        initialToken={joinToken}
        notice={blockedTeacherAccess ? 'Teacher tools require an approved teacher account. Student access is limited to the session join screen.' : ''}
      />
    );
  }

  return (
    <div className="student-view-wrapper min-h-screen pb-20">
      <div className="page-shell page-shell--fluid space-y-6 py-6">
        <StudentHeader
          sessionCode={sessionInfo.code}
          groupNumber={sessionInfo.group}
          isConnected={isConnected}
          isRecording={isRecording}
          isPageVisible={isPageVisible}
          elapsedTime={elapsedTime}
          uploadState={uploadState}
        />

        {uploadError && (
          <Alert tone="danger" title="Upload error">
            <p>{uploadError}</p>
          </Alert>
        )}

        <div className="grid min-h-[calc(100vh-15rem)] grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="min-h-[24rem]">
            <TranscriptionPanel transcription={transcription} uploadState={uploadState} />
          </div>

          <div className="min-h-[24rem]">
            {sessionInfo.mode === 'checkbox' ? (
              <ChecklistPanel
                checklist={checklist}
                isReleased={checklistReleased}
              />
            ) : (
              <SummaryPanel summary={summary} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentView;
