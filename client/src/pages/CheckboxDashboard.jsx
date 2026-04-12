import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCheckboxSocket } from '../hooks/useCheckboxSocket';
import { useCriteriaManager } from '../hooks/useCriteriaManager';
import { SessionHeader } from '../features/admin/components/SessionHeader';
import { CriteriaManager } from '../features/checkbox/components/CriteriaManager';
import { CheckboxGroupGrid } from '../features/checkbox/components/CheckboxGroupGrid';
import { QRCodeModal } from '../features/admin/components/QRCodeModal';
import { SectionHeader } from '../components/ui/panel.jsx';

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
    saveCriteria
  } = useCriteriaManager(sessionCode, socket);

  const [isRecording, setIsRecording] = useState(false);
  const [interval, setInterval] = useState(30);
  const [showQR, setShowQR] = useState(false);

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

  const handleSaveCriteria = async () => {
    const savedCriteria = await saveCriteria(interval);
    if (savedCriteria) {
      // Update all groups with new criteria
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
    }
  };

  const handleReleaseChecklist = (groupNumber) => {
    if (socket && sessionCode) {
      socket.emit('release_checklist', {
        sessionCode,
        groupNumber,
        isReleased: true // Toggle logic could be added here
      });

      // Optimistic update
      setGroups(prev => {
        const newGroups = new Map(prev);
        const group = newGroups.get(groupNumber);
        if (group) {
          newGroups.set(groupNumber, { ...group, isReleased: true });
        }
        return newGroups;
      });
    }
  };

  return (
    <div className="checkbox-dashboard-wrapper min-h-screen pb-20">
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
          feedback={feedback}
          isLoading={isLoading}
        />

        <CheckboxGroupGrid
          groups={groups}
          onRelease={handleReleaseChecklist}
        />
      </main>

      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        sessionCode={sessionCode}
      />
    </div>
  );
}

export default CheckboxDashboard;
