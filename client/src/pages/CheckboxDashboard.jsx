import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCheckboxSocket } from '../hooks/useCheckboxSocket';
import { useCriteriaManager } from '../hooks/useCriteriaManager';
import { SessionHeader } from '../features/admin/components/SessionHeader';
import { CriteriaManager } from '../features/checkbox/components/CriteriaManager';
import { CheckboxGroupGrid } from '../features/checkbox/components/CheckboxGroupGrid';
import { QRCodeModal } from '../features/admin/components/QRCodeModal';
import { PromptSelectorModal } from '../features/prompts/components/PromptSelectorModal.jsx';
import { SectionHeader } from '../components/ui/panel.jsx';
import { normalizeChecklistStatus } from '../lib/statusTone.js';

function createChecklistSeed(criteria = []) {
  return (criteria || []).map((criterion, index) => ({
    ...criterion,
    id: Number(criterion?.id ?? index),
    status: 'grey',
    completed: false,
    quote: null
  }));
}

function resolveReleaseCriteria(groupData, currentCriteria) {
  return (groupData?.checkboxes?.length ? groupData.checkboxes : createChecklistSeed(currentCriteria));
}

function CheckboxDashboard() {
  const [searchParams] = useSearchParams();
  const {
    socket,
    isConnected,
    sessionCode,
    groups,
    setGroups,
    joinSession
  } = useCheckboxSocket();

  const {
    scenario,
    setScenario,
    criteriaText,
    setCriteriaText,
    currentCriteria,
    strictness,
    setStrictness,
    isLoading,
    feedback,
    saveCriteria,
    promptLibrary,
    loadLibrary,
    loadSessionCriteria,
    applyLibraryPrompt,
    isLibraryLoading,
    libraryError,
    setFeedback
  } = useCriteriaManager(sessionCode, socket);

  const [isRecording, setIsRecording] = useState(false);
  const [interval, setInterval] = useState(30);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [applyingPromptId, setApplyingPromptId] = useState(null);

  // Initialize session
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const initSession = async () => {
      try {
        const res = await fetch('/api/new-session?mode=checkbox', {
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

  useEffect(() => {
    const scenarioParam = searchParams.get('scenario');
    const criteriaParam = searchParams.get('criteria');
    const strictnessParam = searchParams.get('strictness');

    if (scenarioParam) setScenario(scenarioParam);
    if (criteriaParam) setCriteriaText(criteriaParam);
    if (strictnessParam) setStrictness(Number(strictnessParam));
  }, [searchParams, setCriteriaText, setScenario, setStrictness]);

  useEffect(() => {
    if (!sessionCode) {
      return undefined;
    }

    let cancelled = false;

    const hydrateSession = async () => {
      const data = await loadSessionCriteria();
      if (cancelled || !data) {
        return;
      }

      const releasedGroups = data.releasedGroups || {};
      const criteriaWithProgress = Array.isArray(data.criteriaWithProgress) ? data.criteriaWithProgress : [];

      setGroups((prev) => {
        const next = new Map(prev);
        const groupNumbers = new Set(Array.from(next.keys()));

        Object.keys(releasedGroups).forEach((group) => {
          const parsedGroup = Number(group);
          if (Number.isFinite(parsedGroup) && parsedGroup > 0) {
            groupNumbers.add(parsedGroup);
          }
        });

        criteriaWithProgress.forEach((criterion) => {
          Object.keys(criterion.groupProgress || {}).forEach((group) => {
            const parsedGroup = Number(group);
            if (Number.isFinite(parsedGroup) && parsedGroup > 0) {
              groupNumbers.add(parsedGroup);
            }
          });
        });

        groupNumbers.forEach((groupNum) => {
          const existing = next.get(groupNum) || {
            transcripts: [],
            checkboxes: [],
            stats: {},
            isReleased: false
          };

          const hydratedCheckboxes = criteriaWithProgress.length > 0
            ? criteriaWithProgress.map((criterion, index) => {
                const progress = criterion.groupProgress?.[groupNum];
                const status = normalizeChecklistStatus(progress?.status);
                return {
                  id: index,
                  dbId: criterion.dbId,
                  description: criterion.description,
                  rubric: criterion.rubric || '',
                  weight: criterion.weight || 1,
                  status,
                  completed: progress?.completed === true || status === 'green',
                  quote: progress?.quote ?? null
                };
              })
            : createChecklistSeed(data.criteria || []);

          next.set(groupNum, {
            ...existing,
            checkboxes: hydratedCheckboxes.length > 0 ? hydratedCheckboxes : existing.checkboxes,
            isReleased: releasedGroups[groupNum] !== undefined ? Boolean(releasedGroups[groupNum]) : existing.isReleased
          });
        });

        return next;
      });
    };

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [loadSessionCriteria, sessionCode, setGroups]);

  useEffect(() => {
    if (!currentCriteria.length) {
      return;
    }

    setGroups((prev) => {
      let changed = false;
      const next = new Map(prev);

      next.forEach((groupData, groupNum) => {
        if (!Array.isArray(groupData.checkboxes) || groupData.checkboxes.length === 0) {
          next.set(groupNum, {
            ...groupData,
            checkboxes: createChecklistSeed(currentCriteria)
          });
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [currentCriteria, groups, setGroups]);

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
          mode: 'checkbox'
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

  const syncGroupsWithCriteria = (savedCriteria) => {
    setGroups(prev => {
      const newGroups = new Map(prev);
      newGroups.forEach((groupData, groupNum) => {
        newGroups.set(groupNum, {
          ...groupData,
          checkboxes: savedCriteria.map(c => ({
            ...c,
            completed: false,
            quote: null,
            status: 'grey'
          }))
        });
      });
      return newGroups;
    });
  };

  const handleSaveCriteria = async () => {
    const savedCriteria = await saveCriteria(interval);
    if (savedCriteria) {
      syncGroupsWithCriteria(savedCriteria);
    }
  };

  const handleReleaseChecklist = (groupNumber) => {
    if (socket && sessionCode) {
      const group = groups.get(groupNumber);
      const releaseCriteria = resolveReleaseCriteria(group, currentCriteria);

      if (!releaseCriteria.length) {
        setFeedback({
          message: 'Save checklist criteria before releasing them to students.',
          type: 'error'
        });
        return;
      }

      socket.emit('release_checklist', {
        sessionCode,
        groupNumber,
        isReleased: true,
        criteria: releaseCriteria
      });

      // Optimistic update
      setGroups(prev => {
        const newGroups = new Map(prev);
        const group = newGroups.get(groupNumber);
        if (group) {
          newGroups.set(groupNumber, {
            ...group,
            isReleased: true,
            checkboxes: group.checkboxes?.length ? group.checkboxes : releaseCriteria
          });
        }
        return newGroups;
      });
    }
  };

  const handleReleaseAllChecklists = () => {
    if (!socket || !sessionCode) {
      return;
    }

    const releaseTargets = Array.from(groups.entries())
      .filter(([, groupData]) => !groupData?.isReleased)
      .map(([groupNumber, groupData]) => ({
        groupNumber,
        criteria: resolveReleaseCriteria(groupData, currentCriteria)
      }));

    if (!releaseTargets.length) {
      setFeedback({
        message: groups.size === 0
          ? 'Student groups need to join before you can release a checklist.'
          : 'All visible groups have already been released.',
        type: 'primary'
      });
      return;
    }

    const missingCriteria = releaseTargets.some((target) => !target.criteria.length);
    if (missingCriteria) {
      setFeedback({
        message: 'Save checklist criteria before releasing them to students.',
        type: 'error'
      });
      return;
    }

    releaseTargets.forEach(({ groupNumber, criteria }) => {
      socket.emit('release_checklist', {
        sessionCode,
        groupNumber,
        isReleased: true,
        criteria
      });
    });

    setGroups((prev) => {
      const next = new Map(prev);
      releaseTargets.forEach(({ groupNumber, criteria }) => {
        const group = next.get(groupNumber);
        if (!group) {
          return;
        }

        next.set(groupNumber, {
          ...group,
          isReleased: true,
          checkboxes: group.checkboxes?.length ? group.checkboxes : criteria
        });
      });
      return next;
    });

    setFeedback({
      message: `Released checklist to ${releaseTargets.length} ${releaseTargets.length === 1 ? 'group' : 'groups'}.`,
      type: 'success'
    });
  };

  const handleOpenPromptLibrary = async () => {
    setShowPromptLibrary(true);
    await loadLibrary();
  };

  const handleApplySavedPrompt = async (prompt) => {
    setApplyingPromptId(prompt._id);
    const savedCriteria = await applyLibraryPrompt(prompt, interval);
    setApplyingPromptId(null);
    if (savedCriteria) {
      syncGroupsWithCriteria(savedCriteria);
      setShowPromptLibrary(false);
    }
  };

  return (
    <div className="checkbox-dashboard-wrapper min-h-screen pb-20">
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
          title="Live checklist session"
          description="Define the scenario, release criteria to student groups, and watch checklist evidence update in real time."
        />

        <CriteriaManager
          scenario={scenario}
          onScenarioChange={setScenario}
          criteriaText={criteriaText}
          onCriteriaChange={setCriteriaText}
          strictness={strictness}
          onStrictnessChange={setStrictness}
          onSave={handleSaveCriteria}
          onClear={() => {
            setScenario('');
            setCriteriaText('');
          }}
          onReleaseAll={handleReleaseAllChecklists}
          canReleaseAll={groups.size > 0 && currentCriteria.length > 0 && Array.from(groups.values()).some((group) => !group?.isReleased)}
          releaseAllLabel="Release all checklists"
          feedback={feedback}
          isLoading={isLoading}
          onOpenLibrary={handleOpenPromptLibrary}
          isLibraryLoading={isLibraryLoading}
        />

        <CheckboxGroupGrid
          groups={groups}
          onRelease={handleReleaseChecklist}
          canReleaseChecklist={currentCriteria.length > 0}
        />
      </main>

      <PromptSelectorModal
        isOpen={showPromptLibrary}
        onClose={() => {
          if (!applyingPromptId) {
            setShowPromptLibrary(false);
          }
        }}
        mode="checkbox"
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

export default CheckboxDashboard;
