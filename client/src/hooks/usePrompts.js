import { useState, useEffect, useCallback } from 'react';

export function usePrompts() {
    const [prompts, setPrompts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({
        total: 0,
        offset: 0,
        limit: 20,
        hasMore: false
    });
    const [filters, setFilters] = useState({
        search: '',
        category: '',
        mode: ''
    });
    const [availableCategories, setAvailableCategories] = useState([]);

    const fetchPrompts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url = new URL('/api/prompts', window.location.origin);
            url.searchParams.append('offset', pagination.offset);
            url.searchParams.append('limit', pagination.limit);
            if (filters.search) url.searchParams.append('search', filters.search);
            if (filters.category) url.searchParams.append('category', filters.category);
            if (filters.mode) url.searchParams.append('mode', filters.mode);

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const data = await response.json();
            setPrompts(data.prompts);
            setPagination(prev => ({ ...prev, ...data.pagination }));
            setAvailableCategories(data.filters.categories);
        } catch (err) {
            console.error('Failed to load prompts:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [pagination.offset, pagination.limit, filters]);

    // Initial load and reload on filter/pagination change
    useEffect(() => {
        fetchPrompts();
    }, [fetchPrompts]);

    const createPrompt = async (promptData) => {
        try {
            const response = await fetch('/api/prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(promptData)
            });
            if (!response.ok) throw new Error('Failed to create prompt');
            await fetchPrompts();
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };

    const updatePrompt = async (id, promptData) => {
        try {
            const response = await fetch(`/api/prompts/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(promptData)
            });
            if (!response.ok) throw new Error('Failed to update prompt');
            await fetchPrompts();
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };

    const deletePrompt = async (id) => {
        if (!confirm('Are you sure you want to delete this prompt?')) return false;
        try {
            const response = await fetch(`/api/prompts/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete prompt');
            await fetchPrompts();
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };

    const clonePrompt = async (id) => {
        try {
            const response = await fetch(`/api/prompts/${id}/clone`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to clone prompt');
            await fetchPrompts();
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };

    const usePrompt = async (id) => {
        try {
            const response = await fetch(`/api/prompts/${id}/use`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionCode: 'web-interface' })
            });
            if (!response.ok) throw new Error('Failed to record usage');

            // Return the prompt data so the UI can redirect
            const prompt = prompts.find(p => p._id === id);
            return prompt;
        } catch (err) {
            console.error('Failed to use prompt:', err);
            return null;
        }
    };

    const handlePageChange = (direction) => {
        if (direction === 'next' && pagination.hasMore) {
            setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
        } else if (direction === 'prev' && pagination.offset > 0) {
            setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
        }
    };

    return {
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
        refresh: fetchPrompts
    };
}
