import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Database,
  Download,
  FileText,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Alert } from "@/components/ui/alert.jsx";
import { Badge, StatusBadge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import { useAuth } from "@/components/AuthContext.jsx";
import { MarkdownContent } from "@/components/ui/markdown.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.jsx";
import { EmptyState } from "@/components/ui/empty-state.jsx";
import { Field, Input, Select } from "@/components/ui/field.jsx";
import { Panel, SectionHeader } from "@/components/ui/panel.jsx";
import { getChecklistStatusLabel, getChecklistTone } from "@/lib/statusTone.js";

const MODE_META = {
  summary: {
    label: "Summary",
    icon: MessageSquare,
    tone: "primary",
  },
  checkbox: {
    label: "Checkbox",
    icon: CheckSquare,
    tone: "success",
  },
};

function formatDate(value) {
  if (!value) return "Unknown date";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatDuration(durationMs) {
  if (!durationMs || durationMs <= 0) return "—";
  const totalMinutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (totalMinutes === 0) return "<1m";
  return `${totalMinutes}m`;
}

function truncate(text, limit = 140) {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getModeMeta(mode) {
  return MODE_META[mode] ?? {
    label: "Unknown",
    icon: Database,
    tone: "neutral",
  };
}

function ModeBadge({ mode }) {
  const meta = getModeMeta(mode);
  return (
    <Badge tone={meta.tone} size="sm" icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

function CompletionBadge({ active }) {
  return (
    <StatusBadge tone={active ? "success" : "neutral"} pulse={active}>
      {active ? "Live" : "Complete"}
    </StatusBadge>
  );
}

function ReleaseBadge({ released }) {
  return <Badge tone={released ? "success" : "neutral"}>{released ? "Released" : "Not released"}</Badge>;
}

function CheckboxPreview({ data }) {
  if (!data) return null;

  return (
    <div className="ui-panel ui-panel--subtle ui-panel--pad-md mt-4 space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[var(--text)]">Checklist progress</h4>
        <Badge tone="success" size="sm">
          {data.completionRate ?? 0}%
        </Badge>
      </div>
      <p>
        {data.completedCriteria ?? 0}/{data.totalCriteria ?? 0} criteria completed
      </p>
      {data.scenario ? <p>Scenario: {truncate(data.scenario, 120)}</p> : null}
    </div>
  );
}

function SessionCard({ session, onSelect, showOwner = false }) {
  const meta = getModeMeta(session.mode);
  const Icon = meta.icon;

  return (
    <Panel padding="lg" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="ui-panel-heading__icon">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">Session {session.code}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs copy-muted">
              <ModeBadge mode={session.mode} />
              <span>{formatDate(session.created_at)}</span>
            </div>
            {showOwner && session.owner?.email ? (
              <div className="mt-2 text-xs copy-muted">Owner {session.owner.email}</div>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <CompletionBadge active={session.active} />
          <div className="mt-1 text-xs copy-muted">{formatDuration(session.duration)}</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div className="ui-metric">
          <span className="ui-metric__label">Groups</span>
          <span className="ui-metric__value">{session.totalStudents || 0}</span>
        </div>
        <div className="ui-metric">
          <span className="ui-metric__label">Segments</span>
          <span className="ui-metric__value">{session.totalTranscripts || 0}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm copy-muted">
        <Clock3 className="h-4 w-4" />
        <span>Last update {formatDate(session.updated_at || session.end_time)}</span>
      </div>

      {session.mode === "checkbox" ? <CheckboxPreview data={session.modeSpecificData} /> : null}

      <Button type="button" variant="primary" className="mt-6 w-full" onClick={() => onSelect(session)}>
        Open history
      </Button>
    </Panel>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="ui-metric">
      <span className="ui-metric__label">{label}</span>
      <span className="ui-metric__value">{value}</span>
    </div>
  );
}

function CriterionStatus({ status }) {
  return <Badge tone={getChecklistTone(status)} size="sm">{getChecklistStatusLabel(status)}</Badge>;
}

function HistorySection({ title, description, icon: Icon, defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Panel padding="lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {Icon ? <Icon className="mt-0.5 h-4 w-4 text-[var(--primary)]" /> : null}
          <div>
            <h4 className="text-base font-semibold text-[var(--text)]">{title}</h4>
            {description ? <p className="mt-1 text-sm">{description}</p> : null}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span>{isOpen ? "Collapse" : "Expand"}</span>
        </Button>
      </div>

      {isOpen ? <div className="mt-4">{children}</div> : null}
    </Panel>
  );
}

function GroupHistoryPanel({ sessionMode, group }) {
  if (!group) {
    return (
      <Panel tone="subtle" padding="lg" className="text-center text-sm">
        Select a group to inspect its history.
      </Panel>
    );
  }

  const stats = group.transcriptStats || {};
  const summaryTimeline = Array.isArray(group.summaryTimeline) ? group.summaryTimeline : [];
  const earlierSummaryTimeline =
    group.latestSummary && summaryTimeline.length > 0 && summaryTimeline[summaryTimeline.length - 1]?.summary_text === group.latestSummary
      ? summaryTimeline.slice(0, -1)
      : summaryTimeline;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Segments" value={stats.total_segments ?? group.segments?.length ?? 0} />
        <MetricCard label="Words" value={stats.total_words ?? 0} />
        <MetricCard
          label="Audio duration"
          value={stats.total_duration ? `${Math.round(stats.total_duration)}s` : "—"}
        />
      </div>

      <Panel padding="lg">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--primary)]" />
          <h4 className="text-base font-semibold text-[var(--text)]">Full transcript</h4>
        </div>
        <div className="ui-code-block max-h-72 overflow-y-auto text-sm leading-6">
          {group.fullTranscript || "No transcript recorded yet."}
        </div>
      </Panel>

      {sessionMode === "summary" ? (
        <HistorySection
          title="Summary"
          description="Expand to review the final summary and earlier summary updates for this group."
          icon={MessageSquare}
        >
          {group.latestSummary ? (
            <div className="ui-panel ui-panel--subtle ui-panel--pad-md text-sm leading-6 text-[var(--text)]">
              <MarkdownContent content={group.latestSummary} />
            </div>
          ) : (
            <p className="text-sm">No summary stored for this group yet.</p>
          )}

          {earlierSummaryTimeline.length ? (
            <div className="mt-4 space-y-4">
              {earlierSummaryTimeline.map((entry, index) => (
                <div key={`${entry.segment_cursor}-${entry.created_at || index}`} className="surface-list__item">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--text)]">Summary point {index + 1}</p>
                    <p className="text-xs copy-muted">{formatDate(entry.created_at)}</p>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] copy-muted">
                    Up to segment {entry.segment_cursor}
                  </p>
                  <MarkdownContent content={entry.summary_text} className="mt-2 text-sm text-[var(--text)]" />
                </div>
              ))}
            </div>
          ) : group.latestSummary ? (
            <p className="mt-4 text-sm">
              No earlier summary versions were stored for this group.
            </p>
          ) : null}
        </HistorySection>
      ) : null}

      {group.modeSpecificData?.criteria?.length ? (
        <Panel padding="lg">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-[var(--text)]">Checklist state</h4>
              {group.modeSpecificData?.scenario ? (
                <p className="mt-1 text-sm">{group.modeSpecificData.scenario}</p>
              ) : null}
            </div>
            <ReleaseBadge released={Boolean(group.modeSpecificData.isReleased)} />
          </div>
          <div className="space-y-3">
            {group.modeSpecificData.criteria.map((criterion) => (
              <div key={criterion.id} className="surface-list__item">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)]">{criterion.description}</p>
                    {criterion.rubric ? (
                      <MarkdownContent content={criterion.rubric} className="mt-1 text-sm" />
                    ) : null}
                    {criterion.quote ? (
                      <div className="ui-panel ui-panel--subtle ui-panel--pad-sm mt-3 text-xs text-[var(--text)]">
                        <MarkdownContent content={criterion.quote} />
                      </div>
                    ) : null}
                  </div>
                  <CriterionStatus status={criterion.status} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <HistorySection
        title="Transcript segments"
        description="Expand to inspect the original chunk-by-chunk transcript history."
        icon={Database}
      >
        {group.segments?.length ? (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {group.segments.map((segment, index) => (
              <div key={segment.id || `${group.groupNumber}-${index}`} className="surface-list__item">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs copy-muted">
                  <span>Segment {segment.segment_number ?? index + 1}</span>
                  <span>{formatDate(segment.created_at)}</span>
                </div>
                <p className="text-sm leading-6 whitespace-pre-wrap text-[var(--text)]">{segment.text}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs copy-muted">
                  <span>{segment.word_count || 0} words</span>
                  <span>
                    {segment.duration_seconds
                      ? `${Math.round(segment.duration_seconds)}s`
                      : "Duration unavailable"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm">No transcript segments stored for this group.</p>
        )}
      </HistorySection>
    </div>
  );
}

function SessionModal({ selectedSession, onClose, showOwner = false }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeGroupNumber, setActiveGroupNumber] = useState(null);
  const [downloading, setDownloading] = useState("");

  const sessionCode = selectedSession?.code;
  const session = detail?.session || selectedSession;
  const groups = detail?.groups || [];
  const activeGroup =
    groups.find((group) => Number(group.groupNumber) === Number(activeGroupNumber)) ||
    groups[0] ||
    null;

  useEffect(() => {
    if (!sessionCode) return undefined;

    const controller = new AbortController();

    async function loadDetail() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/history/sessions/${encodeURIComponent(sessionCode)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load session history (HTTP ${response.status})`);
        }
        const payload = await response.json();
        setDetail(payload);
        const firstGroup = payload.groups?.[0];
        setActiveGroupNumber(firstGroup?.groupNumber ?? null);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load session history");
          setDetail(null);
        }
      } finally {
        setLoading(false);
      }
    }

    loadDetail();
    return () => controller.abort();
  }, [sessionCode]);

  const handleDownload = useCallback(
    async (type) => {
      if (!sessionCode) return;
      setDownloading(type);
      try {
        const response = await fetch(
          `/api/history/sessions/${encodeURIComponent(sessionCode)}/export/${type}`,
        );
        if (!response.ok) {
          throw new Error(`Download failed (HTTP ${response.status})`);
        }
        const blob = await response.blob();
        downloadBlob(blob, `session-${sessionCode}-${type}.json`);
      } catch (err) {
        setError(err.message || "Failed to download history");
      } finally {
        setDownloading("");
      }
    },
    [sessionCode],
  );

  if (!selectedSession) return null;

  return (
    <Dialog open={Boolean(selectedSession)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Session {session?.code}</DialogTitle>
          <DialogDescription>{formatDate(session?.created_at)}</DialogDescription>
        </DialogHeader>

        <div className="cluster justify-between">
          <div className="cluster">
            <ModeBadge mode={session?.mode} />
            <CompletionBadge active={session?.active} />
            {showOwner && session?.owner?.email ? (
              <Badge tone="neutral" size="sm">
                Owner {session.owner.email}
              </Badge>
            ) : null}
          </div>
          <div className="cluster">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={downloading === "combined"}
              onClick={() => handleDownload("combined")}
            >
              <Download className="h-4 w-4" />
              {downloading === "combined" ? "Preparing…" : "Combined JSON"}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={downloading === "segments"}
              onClick={() => handleDownload("segments")}
            >
              <Download className="h-4 w-4" />
              {downloading === "segments" ? "Preparing…" : "Segments JSON"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard label="Mode" value={getModeMeta(session?.mode).label} />
          <MetricCard label="Groups" value={session?.totalStudents || 0} />
          <MetricCard label="Segments" value={session?.totalTranscripts || 0} />
          <MetricCard label="Duration" value={formatDuration(session?.duration)} />
        </div>

        {session?.modeSpecificData ? <CheckboxPreview data={session.modeSpecificData} /> : null}

        {error ? (
          <Alert tone="danger" title="Unable to load session history">
            <p>{error}</p>
          </Alert>
        ) : null}

        {loading ? (
          <Panel padding="lg" className="flex min-h-[16rem] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--surface-muted)] border-t-[var(--primary)]" />
              <p className="text-sm">Loading session history…</p>
            </div>
          </Panel>
        ) : (
          <div className="content-split content-split--history">
            <Panel padding="lg" className="h-fit">
              <h4 className="mb-3 text-sm font-semibold text-[var(--text)]">Groups</h4>
              <div className="surface-list">
                {groups.map((group) => (
                  <Button
                    key={group._id || group.groupNumber}
                    type="button"
                    variant={Number(activeGroupNumber) === Number(group.groupNumber) ? "primary" : "secondary"}
                    size="sm"
                    className="justify-start"
                    onClick={() => setActiveGroupNumber(group.groupNumber)}
                  >
                    Group {group.groupNumber}
                  </Button>
                ))}
              </div>
            </Panel>

            <GroupHistoryPanel sessionMode={session?.mode} group={activeGroup} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function DataExplorerView() {
  const { isAdmin } = useAuth();
  const [modeFilter, setModeFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);

  const fetchSessions = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(limit),
        });
        if (modeFilter) {
          params.set("mode", modeFilter);
        }
        if (isAdmin && ownerFilter.trim()) {
          params.set("owner", ownerFilter.trim());
        }

        const response = await fetch(`/api/history/sessions?${params.toString()}`, { signal });
        if (!response.ok) {
          throw new Error(`Failed to load history (HTTP ${response.status})`);
        }

        const data = await response.json();
        setSessions(data.sessions ?? []);
        setPagination(data.pagination ?? { total: 0, hasMore: false });
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load history");
          setSessions([]);
          setPagination({ total: 0, hasMore: false });
        }
      } finally {
        setLoading(false);
      }
    },
    [isAdmin, limit, modeFilter, offset, ownerFilter],
  );

  const handleRetry = useCallback(() => {
    const controller = new AbortController();
    fetchSessions(controller.signal);
  }, [fetchSessions]);

  useEffect(() => {
    const controller = new AbortController();
    fetchSessions(controller.signal);
    return () => controller.abort();
  }, [fetchSessions]);

  const paginationInfo = useMemo(() => {
    if (!pagination.total || !sessions.length) return "No sessions found";
    const start = offset + 1;
    const end = Math.min(offset + sessions.length, pagination.total);
    return `Showing ${start}-${end} of ${pagination.total} sessions`;
  }, [offset, pagination.total, sessions.length]);

  const canGoPrev = offset > 0;
  const canGoNext = pagination.total > 0 && offset + sessions.length < pagination.total;

  return (
    <div className="page-shell page-shell--fluid">
      <div className="stack">
      <SectionHeader
        eyebrow="Teacher workspace"
        title="Session history"
        description="Review completed or live sessions, inspect transcripts and summary snapshots, and export JSON for follow-up analysis."
        actions={(
          <Button type="button" variant="secondary" size="sm" onClick={handleRetry}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        )}
      />

      <Panel padding="lg" tone="subtle">
        <div className={isAdmin ? "grid grid-cols-1 gap-4 md:grid-cols-[14rem_16rem_12rem_auto]" : "grid grid-cols-1 gap-4 md:grid-cols-[14rem_12rem_auto]"}>
          <Field label="Mode">
            <Select
              value={modeFilter}
              onChange={(event) => {
                setModeFilter(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All modes</option>
              <option value="summary">Summary</option>
              <option value="checkbox">Checkbox</option>
            </Select>
          </Field>

          {isAdmin ? (
            <Field label="Owner email">
              <Input
                type="email"
                placeholder="teacher@ri.edu.sg"
                value={ownerFilter}
                onChange={(event) => {
                  setOwnerFilter(event.target.value);
                  setOffset(0);
                }}
              />
            </Field>
          ) : null}

          <Field label="Results per page">
            <Select
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setOffset(0);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </Select>
          </Field>

          <div className="flex items-end">
            <p className="text-sm">{paginationInfo}</p>
          </div>
        </div>
      </Panel>

      {loading ? (
        <Panel padding="lg" className="flex min-h-[18rem] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--surface-muted)] border-t-[var(--primary)]" />
            <p className="text-sm">Loading session history…</p>
          </div>
        </Panel>
      ) : null}

      {error && !loading ? (
        <Alert tone="danger" title="Failed to load history">
          <p>{error}</p>
        </Alert>
      ) : null}

      {!loading && !error && sessions.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No sessions found"
          description={isAdmin ? "No sessions match the current owner and mode filters." : "No teacher-owned sessions match your current filters."}
        />
      ) : null}

      {!loading && !error && sessions.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {sessions.map((session) => (
              <SessionCard
                key={session._id ?? session.code}
                session={session}
                onSelect={setSelectedSession}
                showOwner={isAdmin}
              />
            ))}
          </div>

          <div className="ui-toolbar">
            <div className="text-sm">{paginationInfo}</div>
            <div className="cluster">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={!canGoPrev}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setOffset(offset + limit)}
                disabled={!canGoNext}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {selectedSession ? (
        <SessionModal selectedSession={selectedSession} onClose={() => setSelectedSession(null)} showOwner={isAdmin} />
      ) : null}
      </div>
    </div>
  );
}
