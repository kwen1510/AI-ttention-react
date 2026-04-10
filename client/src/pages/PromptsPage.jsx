import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePrompts } from '../hooks/usePrompts';
import { PromptsList } from '../features/prompts/components/PromptsList';
import { PromptModal } from '../features/prompts/components/PromptModal';
import { PromptViewModal } from '../features/prompts/components/PromptViewModal';
import { Plus, Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { buildModePath, getStagingBasePath } from '../lib/stagingBypass.js';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { Field, Input, Select } from '../components/ui/field.jsx';
import { Panel, SectionHeader } from '../components/ui/panel.jsx';

function PromptsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const basePath = getStagingBasePath(location.pathname);
  const {
    prompts,
    loading,
    error,
    pagination,
    filters,
    setFilters,
    availableCategories,
    createPrompt,
    updatePrompt,
    deletePrompt,
    clonePrompt,
    usePrompt,
    handlePageChange,
    refresh
  } = usePrompts();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const handleCreate = async (data) => {
    const success = await createPrompt(data);
    if (success) setIsCreateModalOpen(false);
  };

  const handleUpdate = async (data) => {
    if (!selectedPrompt) return;
    const success = await updatePrompt(selectedPrompt._id, data);
    if (success) {
      setIsCreateModalOpen(false);
      setIsEditMode(false);
      setSelectedPrompt(null);
    }
  };

  const handleDelete = async (id) => {
    const success = await deletePrompt(id);
    if (success) {
      setIsViewModalOpen(false);
      setSelectedPrompt(null);
    }
  };

  const handleClone = async (promptRecord) => {
    const authorName = window.prompt('Enter your name for the cloned prompt:', 'Anonymous Teacher');
    if (authorName) {
      const success = await clonePrompt(promptRecord._id, authorName);
      if (success) {
        setIsViewModalOpen(false);
        setSelectedPrompt(null);
      }
    }
  };

  const handleUse = async (id) => {
    const prompt = await usePrompt(id);
    if (prompt) {
      if (prompt.mode === 'checkbox') {
        // Parse scenario and criteria
        let scenario = '';
        const criteria = [];
        const lines = (prompt.content || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);

        for (const line of lines) {
          const scenarioMatch = line.match(/^scenario\s*[:\-]\s*(.+)$/i);
          if (!scenario && scenarioMatch) {
            scenario = scenarioMatch[1].trim();
            continue;
          }
          criteria.push(line);
        }

        if (!scenario && criteria.length > 0) {
          scenario = criteria.shift();
        }

        const params = new URLSearchParams();
        if (scenario) params.set('scenario', scenario);
        if (criteria.length > 0) params.set('criteria', criteria.join('\n'));
        if (prompt.strictness) params.set('strictness', prompt.strictness);

        navigate(`${buildModePath('/checkbox', basePath)}?${params.toString()}`);
      } else {
        navigate(`${buildModePath('/admin', basePath)}?prompt=${encodeURIComponent(prompt.content)}`);
      }
    }
  };

  const openCreate = () => {
    setSelectedPrompt(null);
    setIsEditMode(false);
    setIsCreateModalOpen(true);
  };

  const openEdit = (prompt) => {
    setSelectedPrompt(prompt);
    setIsEditMode(true);
    setIsViewModalOpen(false);
    setIsCreateModalOpen(true);
  };

  const openView = (prompt) => {
    setSelectedPrompt(prompt);
    setIsViewModalOpen(true);
  };

  return (
    <div className="min-h-screen pb-20">
      <main className="page-shell page-shell--fluid stack">
        <SectionHeader
          eyebrow="Teacher workspace"
          title="Prompt library"
          description="Create reusable summary and checklist prompts, refine them, and launch them directly into a session."
          actions={(
            <div className="cluster">
              <Button onClick={refresh} variant="secondary" size="sm">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={openCreate} variant="primary">
                <Plus className="h-4 w-4" />
                Create Prompt
              </Button>
            </div>
          )}
        />

        <Panel padding="lg" tone="subtle">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_14rem_12rem]">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  type="text"
                  placeholder="Search prompts..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </Field>
            <Field label="Category">
              <Select
                value={filters.category}
                onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
              >
                <option value="">All categories</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </Select>
            </Field>
            <Field label="Mode">
              <Select
                value={filters.mode}
                onChange={(e) => setFilters(prev => ({ ...prev, mode: e.target.value }))}
              >
                <option value="">All modes</option>
                <option value="summary">Summary</option>
                <option value="checkbox">Checkbox</option>
              </Select>
            </Field>
          </div>
        </Panel>

        {error && (
          <Alert tone="danger" title="Unable to load prompts">
            <p>{error}</p>
          </Alert>
        )}

        {loading ? (
          <Panel padding="lg" className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--surface-muted)] border-t-[var(--primary)]" />
              <p className="text-sm">Loading prompt library…</p>
            </div>
          </Panel>
        ) : (
          <>
            <PromptsList prompts={prompts} onView={openView} />

            {pagination.total > 0 && (
              <div className="ui-toolbar">
                <div className="text-sm copy-muted">
                  Showing <span className="copy-strong">{pagination.offset + 1}</span> to{' '}
                  <span className="copy-strong">{Math.min(pagination.offset + pagination.limit, pagination.total)}</span> of{' '}
                  <span className="copy-strong">{pagination.total}</span> prompts
                </div>
                <div className="cluster">
                  <Button
                    onClick={() => handlePageChange('prev')}
                    disabled={pagination.offset === 0}
                    variant="secondary"
                    size="sm"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    onClick={() => handlePageChange('next')}
                    disabled={!pagination.hasMore}
                    variant="primary"
                    size="sm"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <PromptModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={isEditMode ? handleUpdate : handleCreate}
        initialData={selectedPrompt}
        categories={availableCategories}
      />

      <PromptViewModal
        isOpen={isViewModalOpen}
        prompt={selectedPrompt}
        onClose={() => setIsViewModalOpen(false)}
        onUse={handleUse}
        onEdit={openEdit}
        onClone={handleClone}
        onDelete={handleDelete}
      />
    </div>
  );
}

export default PromptsPage;
