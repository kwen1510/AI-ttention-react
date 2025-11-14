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
    badge: "bg-blue-100 text-blue-800",
  },
  checkbox: {
    label: "Checkbox",
    icon: CheckSquare,
    badge: "bg-green-100 text-green-800",
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
    badge: "bg-gray-100 text-gray-700",
  };
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}
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
    <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-900 space-y-1">
      <p className="font-semibold">Checklist Progress</p>
      <p>
        <strong>Completion:</strong> {rate}% ({data.completedCriteria}/
        {data.totalCriteria})
      </p>
      {data.scenario && (
        <p className="text-emerald-800/80">
          <strong>Scenario:</strong> {truncate(data.scenario, 120)}
        </p>
      )}
    </div>
  );
}

function SessionCard({ session, onSelect }) {
  const meta = MODE_META[session.mode] ?? MODE_META.summary;
  const Icon = meta.icon;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 ${meta.badge.replace(
                "text-",
                "text-",
              )} rounded-lg bg-opacity-20 flex items-center justify-center`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Session {session.code}
              </h3>
              <div className="flex items-center space-x-2 text-xs text-gray-600 mt-1">
                <ModeBadge mode={session.mode} />
                <span>{formatDate(session.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-sm font-semibold ${
                session.active ? "text-green-600" : "text-gray-600"
              }`}
            >
              {session.active ? "Live" : "Complete"}
            </div>
            {session.duration && (
              <div className="text-xs text-gray-500">
                {formatDuration(session.duration)}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span>
              {session.totalStudents || session.groups?.length || 0} students
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-gray-500" />
            <span>{session.totalTranscripts || 0} transcripts</span>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span>{formatDuration(session.duration)}</span>
          </div>
          <div className="flex items-center space-x-2">
            <RefreshCw className="w-4 h-4 text-gray-500" />
            <span>
              Last update {formatDate(session.updated_at || session.end_time)}
            </span>
          </div>
        </div>

        {session.mode === "checkbox" && (
          <CheckboxPreview data={session.modeSpecificData} />
        )}

        <button
          type="button"
          className="mt-6 w-full btn btn-muted text-sm justify-center"
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <p className="text-sm text-gray-500">
              {formatDate(session.created_at)}
            </p>
            <h3 className="text-xl font-semibold text-gray-900">
              Session {session.code}
            </h3>
          </div>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-gray-100"
            onClick={onClose}
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-700">
            <div>
              <p className="text-xs uppercase text-gray-500">Mode</p>
              <ModeBadge mode={session.mode} />
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Students</p>
              <p className="text-base font-semibold">
                {session.totalStudents || session.groups?.length || 0}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Transcripts</p>
              <p className="text-base font-semibold">
                {session.totalTranscripts || 0}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Duration</p>
              <p className="text-base font-semibold">
                {formatDuration(session.duration)}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-3">Groups</h4>
            {session.groups?.length ? (
              <div className="space-y-4">
                {session.groups.map((group) => (
                  <div
                    key={group._id ?? group.number}
                    className="border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm text-gray-500">Group</p>
                        <p className="text-xl font-semibold text-gray-900">
                          #{group.number ?? "—"}
                        </p>
                      </div>
                      {group.summary && (
                        <span className="text-sm text-emerald-600 font-medium">
                          Summary available
                        </span>
                      )}
                    </div>
                    {group.summary && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-gray-700 mb-1">
                          Summary
                        </p>
                        <p className="text-sm text-gray-700 bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                          {group.summary}
                        </p>
                      </div>
                    )}

                    {/* Show all transcripts */}
                    {group.transcripts?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-2">
                          Transcripts ({group.transcripts.length})
                        </p>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {group.transcripts.map((transcript, idx) => (
                            <div
                              key={idx}
                              className="text-xs text-gray-600 bg-blue-50 rounded-lg border border-blue-100 p-3"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-gray-800">
                                  Transcript #{idx + 1}
                                </span>
                                {transcript.created_at && (
                                  <span className="text-xs text-gray-500">
                                    {new Date(transcript.created_at).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-700 whitespace-pre-wrap">
                                {transcript.text}
                              </p>
                              {(transcript.word_count || transcript.duration_seconds) && (
                                <div className="flex gap-3 mt-2 text-xs text-gray-500">
                                  {transcript.word_count && (
                                    <span>{transcript.word_count} words</span>
                                  )}
                                  {transcript.duration_seconds && (
                                    <span>{Math.round(transcript.duration_seconds)}s</span>
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
              <div className="text-sm text-gray-600">
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
      <div
        className="surface surface--padded surface--static stack"
        style={{ gap: "1.25rem" }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Mode:
            </label>
            <select
              value={modeFilter}
              onChange={handleChangeMode}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Modes</option>
              <option value="summary">Summary Mode</option>
              <option value="checkbox">Checkbox Mode</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Results per page:
            </label>
            <select
              value={limit}
              onChange={handleChangeLimit}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading session data...</p>
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 font-medium mb-2">
            Failed to load session data
          </p>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
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
          <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Sessions Found
          </h3>
          <p className="text-gray-600">
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
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-gray-600">{paginationInfo}</div>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!canGoPrev}
              className="btn btn-muted disabled:opacity-60 disabled:cursor-not-allowed flex items-center"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="btn btn-primary disabled:opacity-60 disabled:cursor-not-allowed flex items-center"
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
