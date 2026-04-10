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
    isPageVisible
  } = useAudioRecorder(
    sessionInfo.code,
    sessionInfo.group,
    setUploadError,
    joinToken
  );

  // Handle recording state from socket
  useEffect(() => {
    if (recordingState.isRecording && !isRecording) {
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
    <div className="student-view-wrapper min-h-screen bg-gray-50 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <StudentHeader
          sessionCode={sessionInfo.code}
          groupNumber={sessionInfo.group}
          isConnected={isConnected}
          isRecording={isRecording}
          isPageVisible={isPageVisible}
          elapsedTime={elapsedTime}
        />

        {uploadError && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  Upload Error: {uploadError}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
          {/* Left Column: Transcription */}
          <div className="h-full">
            <TranscriptionPanel transcription={transcription} />
          </div>

          {/* Right Column: Summary or Checklist */}
          <div className="h-full">
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
