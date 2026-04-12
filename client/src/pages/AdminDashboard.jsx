import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminSocket } from '../hooks/useAdminSocket';
import { usePromptManager } from '../hooks/usePromptManager';
import { SessionHeader } from '../features/admin/components/SessionHeader';
import { PromptManager } from '../features/admin/components/PromptManager';
import { GroupGrid } from '../features/admin/components/GroupGrid';
import { QRCodeModal } from '../features/admin/components/QRCodeModal';
import { PromptSelectorModal } from '../features/prompts/components/PromptSelectorModal.jsx';
import { SectionHeader } from '../components/ui/panel.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { DEFAULT_SUMMARY_PROMPT } from '../lib/prompts.js';
import { Send } from 'lucide-react';

function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const selectedPrompt = String(searchParams.get('prompt') || '').trim();
  const {
    socket,
    isConnected,
    sessionCode,
    groups,
    setGroups,
    joinSession
  } = useAdminSocket();

  const {
    currentPrompt,
    setCurrentPrompt,
    promptLibrary,
    savePrompt,
    testPrompt,
    feedback,
    loadSessionPrompt,
    loadLibrary,
    applyLibraryPrompt,
    isLibraryLoading,
    libraryError
  } = usePromptManager(sessionCode, socket);

  const [isRecording, setIsRecording] = useState(false);
  const [interval, setInterval] = useState(30);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [applyingPromptId, setApplyingPromptId] = useState(null);
  const [releaseFeedback, setReleaseFeedback] = useState(null);

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
      const controller = new AbortController();
      void loadSessionPrompt({
        signal: controller.signal,
        fallbackPrompt: selectedPrompt || DEFAULT_SUMMARY_PROMPT
      });
      return () => controller.abort();
    }

    return undefined;
  }, [sessionCode, loadSessionPrompt, selectedPrompt]);

  useEffect(() => {
    if (selectedPrompt) {
      setCurrentPrompt(selectedPrompt);
    }
  }, [selectedPrompt, setCurrentPrompt]);

  useEffect(() => {
    if (!isRecording) {
      setElapsedTime(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedTime((previous) => previous + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRecording]);

  const elapsedInCycle = interval > 0 ? elapsedTime % interval : 0;
  const nextChunkIn = isRecording
    ? (elapsedInCycle === 0 ? interval : interval - elapsedInCycle)
    : null;

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

  const handleOpenPromptLibrary = async () => {
    setShowPromptLibrary(true);
    await loadLibrary();
  };

  const handleApplySavedPrompt = async (prompt) => {
    setApplyingPromptId(prompt._id);
    const success = await applyLibraryPrompt(prompt);
    setApplyingPromptId(null);
    if (success) {
      setShowPromptLibrary(false);
    }
  };

  const showReleaseFeedback = (message, type = 'primary') => {
    setReleaseFeedback({ message, type });
    if (type !== 'error') {
      window.setTimeout(() => {
        setReleaseFeedback((current) => (current?.message === message ? null : current));
      }, 5000);
    }
  };

  const handleReleaseSummary = (groupNumber) => {
    if (!socket || !sessionCode) {
      return;
    }

    socket.emit('release_summary', {
      sessionCode,
      groupNumber,
      isReleased: true
    });

    setGroups((prev) => {
      const next = new Map(prev);
      const group = next.get(groupNumber);
      if (group) {
        next.set(groupNumber, {
          ...group,
          isReleased: true
        });
      }
      return next;
    });

    showReleaseFeedback(`Released summary to Group ${groupNumber}.`, 'success');
  };

  const handleReleaseAllSummaries = () => {
    if (!socket || !sessionCode) {
      return;
    }

    const releaseTargets = Array.from(groups.entries())
      .filter(([, groupData]) => !groupData?.isReleased)
      .map(([groupNumber]) => groupNumber);

    if (!releaseTargets.length) {
      showReleaseFeedback(
        groups.size === 0
          ? 'Student groups need to join before you can release summaries.'
          : 'All visible groups have already been released.',
        'primary'
      );
      return;
    }

    releaseTargets.forEach((groupNumber) => {
      socket.emit('release_summary', {
        sessionCode,
        groupNumber,
        isReleased: true
      });
    });

    setGroups((prev) => {
      const next = new Map(prev);
      releaseTargets.forEach((groupNumber) => {
        const group = next.get(groupNumber);
        if (!group) {
          return;
        }

        next.set(groupNumber, {
          ...group,
          isReleased: true
        });
      });
      return next;
    });

    showReleaseFeedback(
      `Released summaries to ${releaseTargets.length} ${releaseTargets.length === 1 ? 'group' : 'groups'}.`,
      'success'
    );
  };

  const canReleaseAll = groups.size > 0 && Array.from(groups.values()).some((group) => !group?.isReleased);

  return (
    <div className="admin-dashboard-wrapper min-h-screen pb-20">
      <SessionHeader
        sessionCode={sessionCode}
        isConnected={isConnected}
        isRecording={isRecording}
        elapsedTime={elapsedTime}
        nextChunkIn={nextChunkIn}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onOpenQR={() => setShowQR(true)}
        interval={interval}
        onIntervalChange={setInterval}
      />

      <main className="page-shell page-shell--fluid stack">
        <SectionHeader
          eyebrow="Teacher workspace"
          title="Live summary session"
          description="Monitor group participation, review transcript flow, and refine the running summary prompt in one place."
          actions={(
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleReleaseAllSummaries}
              disabled={!canReleaseAll}
            >
              <Send className="h-4 w-4" />
              <span>Release all summaries</span>
            </Button>
          )}
        />

        {releaseFeedback ? (
          <Alert tone={releaseFeedback.type === 'error' ? 'danger' : releaseFeedback.type === 'success' ? 'success' : 'primary'}>
            <p>{releaseFeedback.message}</p>
          </Alert>
        ) : null}

        <PromptManager
          currentPrompt={currentPrompt}
          onPromptChange={setCurrentPrompt}
          onSave={savePrompt}
          onTest={testPrompt}
          onReset={() => setCurrentPrompt(DEFAULT_SUMMARY_PROMPT)}
          feedback={feedback}
          onOpenLibrary={handleOpenPromptLibrary}
          isLibraryLoading={isLibraryLoading}
        />

        <GroupGrid groups={groups} onRelease={handleReleaseSummary} />
      </main>

      <PromptSelectorModal
        isOpen={showPromptLibrary}
        onClose={() => {
          if (!applyingPromptId) {
            setShowPromptLibrary(false);
          }
        }}
        mode="summary"
        prompts={promptLibrary}
        isLoading={isLibraryLoading}
        error={libraryError}
        onRefresh={loadLibrary}
        onUsePrompt={handleApplySavedPrompt}
        applyingPromptId={applyingPromptId}
      />

      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        sessionCode={sessionCode}
      />
    </div>
  );
}

export default AdminDashboard;
