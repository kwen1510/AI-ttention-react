import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  MessageSquare,
  RefreshCw,
  Users,
  X,
} from "lucide-react";

const MODE_META = {
  summary: {
    label: "Summary",
    icon: MessageSquare,
    badge: "bg-gradient-to-br from-blue-400/20 to-indigo-500/20 text-blue-700 border border-blue-300/30",
  },
  checkbox: {
    label: "Checkbox",
    icon: CheckSquare,
    badge: "bg-gradient-to-br from-emerald-400/20 to-teal-500/20 text-emerald-700 border border-emerald-300/30",
  },
};

function formatDate(value) {
  if (!value) return "Unknown date";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatDuration(durationMs) {
  if (!durationMs || durationMs <= 0) return "—";
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

function truncate(text, limit = 140) {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}

function ModeBadge({ mode }) {
  const meta = MODE_META[mode] ?? {
    label: "Unknown",
    icon: Database,
    badge: "bg-gradient-to-br from-slate-400/20 to-gray-500/20 text-slate-700 border border-slate-300/30",
  };
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${meta.badge}`}
    >
      <Icon className="w-3.5 h-3.5 mr-1" />
      {meta.label}
    </span>
  );
}

function CheckboxPreview({ data }) {
  if (!data) return null;
  const rate = data.completionRate ?? 0;
  return (
    <div className="mt-4 p-4 bg-gradient-to-br from-emerald-50/60 to-teal-50/60 backdrop-blur-sm border border-emerald-200/50 rounded-lg text-sm text-emerald-900 space-y-1">
      <p className="font-semibold text-emerald-700">Checklist Progress</p>
      <p>
        <strong className="text-emerald-800">Completion:</strong> {rate}% ({data.completedCriteria}/
        {data.totalCriteria})
      </p>
      {data.scenario && (
        <p className="text-emerald-800/80">
          <strong className="text-emerald-800">Scenario:</strong> {truncate(data.scenario, 120)}
        </p>
      )}
    </div>
  );
}

function SessionCard({ session, onSelect }) {
  const meta = MODE_META[session.mode] ?? MODE_META.summary;
  const Icon = meta.icon;

  return (
    <div className="glass-panel overflow-hidden hover:shadow-2xl transition-all duration-300 group">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-cyan-400/20 to-blue-500/20 backdrop-blur-sm border border-cyan-300/30 group-hover:scale-110 transition-transform">
              <Icon className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold gradient-text">
                Session {session.code}
              </h3>
              <div className="flex items-center space-x-2 text-xs text-slate-600 mt-1">
                <ModeBadge mode={session.mode} />
                <span>{formatDate(session.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-sm font-semibold ${
                session.active ? "text-emerald-600" : "text-slate-600"
              }`}
            >
              {session.active ? "Live" : "Complete"}
            </div>
            {session.duration && (
              <div className="text-xs text-slate-500">
                {formatDuration(session.duration)}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-slate-700">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-cyan-500" />
            <span className="font-medium">
              {session.totalStudents || session.groups?.length || 0} students
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-blue-500" />
            <span className="font-medium">{session.totalTranscripts || 0} transcripts</span>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-violet-500" />
            <span className="font-medium">{formatDuration(session.duration)}</span>
          </div>
          <div className="flex items-center space-x-2 col-span-2">
            <RefreshCw className="w-4 h-4 text-slate-500" />
            <span className="text-xs">
              Last update {formatDate(session.updated_at || session.end_time)}
            </span>
          </div>
        </div>

        {session.mode === "checkbox" && (
          <CheckboxPreview data={session.modeSpecificData} />
        )}

        <button
          type="button"
          className="mt-6 w-full btn btn-primary text-sm justify-center"
          onClick={() => onSelect(session)}
        >
          View groups &amp; transcripts
        </button>
      </div>
    </div>
  );
}

function SessionModal({ session, onClose }) {
  if (!session) return null;
  return (
    <div className="qr-modal-backdrop flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="qr-modal-content max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-white/20">
          <div>
            <p className="text-sm text-slate-500">
              {formatDate(session.created_at)}
            </p>
            <h3 className="text-xl font-semibold gradient-text">
              Session {session.code}
            </h3>
          </div>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-white/40 transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-700">
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold mb-1">Mode</p>
              <ModeBadge mode={session.mode} />
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold mb-1">Students</p>
              <p className="text-base font-bold gradient-text">
                {session.totalStudents || session.groups?.length || 0}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold mb-1">Transcripts</p>
              <p className="text-base font-bold gradient-text">
                {session.totalTranscripts || 0}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500 font-semibold mb-1">Duration</p>
              <p className="text-base font-bold gradient-text">
                {formatDuration(session.duration)}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-semibold gradient-text mb-3">Groups</h4>
            {session.groups?.length ? (
              <div className="space-y-4">
                {session.groups.map((group) => (
                  <div
                    key={group._id ?? group.number}
                    className="glass-panel p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Group</p>
                        <p className="text-xl font-bold gradient-text">
                          #{group.number ?? "—"}
                        </p>
                      </div>
                      {group.summary && (
                        <span className="premium-chip text-emerald-600 font-semibold">
                          Summary available
                        </span>
                      )}
                    </div>
                    {group.summary && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-slate-700 mb-1">
                          Summary
                        </p>
                        <p className="text-sm text-slate-700 bg-gradient-to-br from-emerald-50/60 to-teal-50/60 backdrop-blur-sm rounded-lg p-3 border border-emerald-200/50">
                          {group.summary}
                        </p>
                      </div>
                    )}

                    {/* Show all transcripts */}
                    {group.transcripts?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-2">
                          Transcripts ({group.transcripts.length})
                        </p>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {group.transcripts.map((transcript, idx) => (
                            <div
                              key={idx}
                              className="text-xs text-slate-600 bg-gradient-to-br from-blue-50/60 to-indigo-50/60 backdrop-blur-sm rounded-lg border border-blue-200/50 p-3"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-slate-800">
                                  Transcript #{idx + 1}
                                </span>
                                {transcript.created_at && (
                                  <span className="text-xs text-slate-500">
                                    {new Date(transcript.created_at).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-700 whitespace-pre-wrap">
                                {transcript.text}
                              </p>
                              {(transcript.word_count || transcript.duration_seconds) && (
                                <div className="flex gap-3 mt-2 text-xs text-slate-500">
                                  {transcript.word_count && (
                                    <span className="font-medium">{transcript.word_count} words</span>
                                  )}
                                  {transcript.duration_seconds && (
                                    <span className="font-medium">{Math.round(transcript.duration_seconds)}s</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-600 text-center py-8">
                No group data recorded for this session.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DataExplorerView() {
  const [modeFilter, setModeFilter] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);

  const fetchSessions = useCallback(
    async (signal) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(limit),
        });
        if (modeFilter) {
          params.set("mode", modeFilter);
        }
        const response = await fetch(
          `/api/data/sessions?${params.toString()}`,
          {
            signal,
          },
        );
        if (!response.ok) {
          throw new Error(`Failed to load sessions (HTTP ${response.status})`);
        }
        const data = await response.json();
        setSessions(data.sessions ?? []);
        setPagination(data.pagination ?? { total: 0, hasMore: false });
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load sessions");
          setSessions([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [modeFilter, limit, offset],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSessions(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchSessions]);

  const paginationInfo = useMemo(() => {
    if (!pagination.total || !sessions.length) return "No sessions found";
    const start = offset + 1;
    const end = Math.min(offset + sessions.length, pagination.total);
    return `Showing ${start}-${end} of ${pagination.total} sessions`;
  }, [pagination.total, offset, sessions.length]);

  const canGoPrev = offset > 0;
  const canGoNext =
    pagination.total > 0 && offset + sessions.length < pagination.total;

  const handlePrev = () => {
    if (!canGoPrev) return;
    setOffset(Math.max(0, offset - limit));
  };

  const handleNext = () => {
    if (!canGoNext) return;
    setOffset(offset + limit);
  };

  const handleChangeMode = (event) => {
    setModeFilter(event.target.value);
    setOffset(0);
  };

  const handleChangeLimit = (event) => {
    setLimit(Number(event.target.value));
    setOffset(0);
  };

  const handleRetry = () => {
    setOffset(0);
    const controller = new AbortController();
    fetchSessions(controller.signal);
  };

  return (
    <main className="page-shell stack">
      <div className="glass-panel mx-4 sm:mx-6 md:mx-8 my-4">
        <div className="flex flex-wrap items-center gap-4 p-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Filter by Mode:
            </label>
            <select
              value={modeFilter}
              onChange={handleChangeMode}
              className="premium-input px-3 py-2"
            >
              <option value="">All Modes</option>
              <option value="summary">Summary Mode</option>
              <option value="checkbox">Checkbox Mode</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Results per page:
            </label>
            <select
              value={limit}
              onChange={handleChangeLimit}
              className="premium-input px-3 py-2"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-primary glow"
              onClick={handleRetry}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-16">
          <div className="animate-spin w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading session data...</p>
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-red-400/20 to-rose-500/20 backdrop-blur-sm border-2 border-red-300/30 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-red-600 font-semibold mb-2 text-lg">
            Failed to load session data
          </p>
          <p className="text-slate-600 text-sm mb-4">{error}</p>
          <button
            type="button"
            className="btn btn-primary glow"
            onClick={handleRetry}
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div className="text-center py-16">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-slate-400/20 to-gray-500/20 backdrop-blur-sm border-2 border-white/40 flex items-center justify-center">
            <Database className="w-12 h-12 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold gradient-text mb-2">
            No Sessions Found
          </h3>
          <p className="text-slate-600">
            No sessions match your current filters.
          </p>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sessions.map((session) => (
            <SessionCard
              key={session._id ?? session.code}
              session={session}
              onSelect={setSelectedSession}
            />
          ))}
        </div>
      )}

      {!loading && !error && pagination.total > 0 && (
        <div className="mt-8 mx-4 sm:mx-6 md:mx-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="premium-chip text-sm font-medium">{paginationInfo}</div>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!canGoPrev}
              className="btn btn-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}

      {selectedSession && (
        <SessionModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </main>
  );
}
