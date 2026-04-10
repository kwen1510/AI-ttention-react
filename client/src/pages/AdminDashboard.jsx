import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminSocket } from '../hooks/useAdminSocket';
import { usePromptManager } from '../hooks/usePromptManager';
import { SessionHeader } from '../features/admin/components/SessionHeader';
import { PromptManager } from '../features/admin/components/PromptManager';
import { GroupGrid } from '../features/admin/components/GroupGrid';
import { QRCodeModal } from '../features/admin/components/QRCodeModal';

function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const {
    socket,
    isConnected,
    sessionCode,
    groups,
    joinSession
  } = useAdminSocket();

  const {
    currentPrompt,
    setCurrentPrompt,
    savePrompt,
    testPrompt,
    feedback,
    loadSessionPrompt
  } = usePromptManager(sessionCode, socket);

  const [isRecording, setIsRecording] = useState(false);
  const [interval, setInterval] = useState(30);
  const [showQR, setShowQR] = useState(false);

  // Initialize session
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const initSession = async () => {
      try {
        const res = await fetch('/api/new-session?mode=summary', {
          signal: controller.signal
        });
        if (!res.ok) {
          throw new Error(`Failed to create session (${res.status})`);
        }
        const data = await res.json();
        joinSession(data.code);
      } catch (err) {
        if (disposed || controller.signal.aborted || err?.name === 'AbortError' || err?.message === 'Failed to fetch') {
          return;
        }
        console.error('Failed to create session:', err);
      }
    };
    initSession();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [joinSession]);

  // Load prompt when session is ready
  useEffect(() => {
    if (sessionCode) {
      loadSessionPrompt();
    }
  }, [sessionCode, loadSessionPrompt]);

  useEffect(() => {
    const prompt = searchParams.get('prompt');
    if (prompt) {
      setCurrentPrompt(prompt);
    }
  }, [searchParams, setCurrentPrompt]);

  const handleStartRecording = async () => {
    if (!sessionCode) return;
    try {
      const res = await fetch(`/api/session/${sessionCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interval: interval * 1000,
          mode: 'summary'
        })
      });

      if (!res.ok) {
        throw new Error(`Failed to start session (${res.status})`);
      }

      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const handleStopRecording = async () => {
    if (!sessionCode) return;
    try {
      const res = await fetch(`/api/session/${sessionCode}/stop`, {
        method: 'POST'
      });

      if (!res.ok) {
        throw new Error(`Failed to stop session (${res.status})`);
      }

      setIsRecording(false);
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  };

  return (
    <div className="admin-dashboard-wrapper min-h-screen bg-gray-50 pb-20">
      <SessionHeader
        sessionCode={sessionCode}
        isConnected={isConnected}
        isRecording={isRecording}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onOpenQR={() => setShowQR(true)}
        interval={interval}
        onIntervalChange={setInterval}
      />

      <main className="page-shell page-shell--fluid stack max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <PromptManager
          currentPrompt={currentPrompt}
          onPromptChange={setCurrentPrompt}
          onSave={savePrompt}
          onTest={testPrompt}
          onReset={() => setCurrentPrompt("Summarise the following classroom discussion in ≤6 clear bullet points:")}
          feedback={feedback}
        />

        <GroupGrid groups={groups} />
      </main>

      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        sessionCode={sessionCode}
      />
    </div>
  );
}

export default AdminDashboard;
