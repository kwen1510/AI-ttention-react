import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrompts } from '../hooks/usePrompts';
import { PromptsList } from '../features/prompts/components/PromptsList';
import { PromptModal } from '../features/prompts/components/PromptModal';
import { PromptViewModal } from '../features/prompts/components/PromptViewModal';
import { Plus, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

function PromptsPage() {
  const navigate = useNavigate();
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

  const handleClone = async (prompt) => {
    const authorName = prompt('Enter your name for the cloned prompt:', 'Anonymous Teacher');
    if (authorName) {
      const success = await clonePrompt(prompt._id, authorName);
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

        navigate(`/checkbox?${params.toString()}`);
      } else {
        navigate(`/admin?prompt=${encodeURIComponent(prompt.content)}`);
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
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Prompt Library</h1>
              <p className="text-sm text-gray-500">Discover and share AI prompts for your classroom</p>
            </div>
            <button
              onClick={openCreate}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Prompt
            </button>
          </div>

          {/* Filters */}
          <div className="mt-6 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search prompts..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div className="flex gap-4">
              <select
                value={filters.category}
                onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="">All Categories</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={filters.mode}
                onChange={(e) => setFilters(prev => ({ ...prev, mode: e.target.value }))}
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="">All Modes</option>
                <option value="summary">Summary</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            <PromptsList prompts={prompts} onView={openView} />

            {/* Pagination */}
            {pagination.total > 0 && (
              <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-4">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange('prev')}
                    disabled={pagination.offset === 0}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange('next')}
                    disabled={!pagination.hasMore}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing <span className="font-medium">{pagination.offset + 1}</span> to <span className="font-medium">{Math.min(pagination.offset + pagination.limit, pagination.total)}</span> of <span className="font-medium">{pagination.total}</span> results
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                      <button
                        onClick={() => handlePageChange('prev')}
                        disabled={pagination.offset === 0}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <span className="sr-only">Previous</span>
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handlePageChange('next')}
                        disabled={!pagination.hasMore}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <span className="sr-only">Next</span>
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modals */}
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
