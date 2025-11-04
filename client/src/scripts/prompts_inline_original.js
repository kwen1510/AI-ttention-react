let currentPrompts = [];
        let currentOffset = 0;
        let currentLimit = 20;
        let totalPrompts = 0;
        let availableCategories = [];
        let currentPromptId = null;

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', () => {
            lucide.createIcons();
            loadPrompts();
            
            // Add event listeners
            document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
            document.getElementById('categoryFilter').addEventListener('change', handleFilterChange);
            document.getElementById('modeFilter').addEventListener('change', handleFilterChange);
            document.getElementById('promptForm').addEventListener('submit', handleFormSubmit);

            // Adapt form for Checkbox schema when mode changes
            document.getElementById('promptMode').addEventListener('change', adaptFormForMode);
            adaptFormForMode();
        });

        // Debounce function for search
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // Load prompts from API
        async function loadPrompts() {
            try {
                showLoading(true);
                
                const search = document.getElementById('searchInput').value;
                const category = document.getElementById('categoryFilter').value;
                const mode = document.getElementById('modeFilter').value;
                
                const url = new URL('/api/prompts', window.location.origin);
                url.searchParams.append('offset', currentOffset);
                url.searchParams.append('limit', currentLimit);
                if (search) url.searchParams.append('search', search);
                if (category) url.searchParams.append('category', category);
                if (mode) url.searchParams.append('mode', mode);

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                console.log('📝 Prompts loaded:', data);

                currentPrompts = data.prompts;
                totalPrompts = data.pagination.total;
                availableCategories = data.filters.categories;
                
                updateCategoryFilter();
                displayPrompts(data.prompts);
                updatePagination(data.pagination);
                
                showLoading(false);

            } catch (err) {
                console.error('❌ Failed to load prompts:', err);
                showError(`Failed to load prompts: ${err.message}`);
                showLoading(false);
            }
        }

        // Show/hide loading state
        function showLoading(show) {
            document.getElementById('loadingState').classList.toggle('hidden', !show);
            document.getElementById('promptsGrid').classList.toggle('hidden', show);
            document.getElementById('emptyState').classList.toggle('hidden', show);
            document.getElementById('pagination').classList.toggle('hidden', show);
        }

        // Update category filter options
        function updateCategoryFilter() {
            const categoryFilter = document.getElementById('categoryFilter');
            const currentValue = categoryFilter.value;
            
            // Clear existing options (except "All Categories")
            while (categoryFilter.children.length > 1) {
                categoryFilter.removeChild(categoryFilter.lastChild);
            }
            
            // Add category options
            availableCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categoryFilter.appendChild(option);
            });
            
            // Restore selection
            categoryFilter.value = currentValue;
        }

        // Display prompts in grid
        function displayPrompts(prompts) {
            const grid = document.getElementById('promptsGrid');
            const emptyState = document.getElementById('emptyState');
            
            if (prompts.length === 0) {
                grid.classList.add('hidden');
                emptyState.classList.remove('hidden');
                return;
            }
            
            grid.classList.remove('hidden');
            emptyState.classList.add('hidden');
            
            const promptsHtml = prompts.map(prompt => {
                const modeColors = {
                    summary: 'bg-blue-100 text-blue-800',
                    mindmap: 'bg-sky-100 text-sky-800',
                    checkbox: 'bg-green-100 text-green-800'
                };

                const modeIcons = {
                    summary: 'message-square',
                    mindmap: 'brain-circuit',
                    checkbox: 'check-square'
                };

                return `
                    <div class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow cursor-pointer" onclick="viewPrompt('${prompt._id}')">
                        <div class="p-6">
                            <div class="flex items-start justify-between mb-4">
                                <div class="flex-1 min-w-0">
                                    <h3 class="text-lg font-semibold text-gray-900 mb-2 truncate">${prompt.title}</h3>
                                    <p class="text-sm text-gray-600 line-clamp-2 mb-3">${prompt.description || 'No description provided'}</p>
                                </div>
                                <div class="flex items-center space-x-2 ml-4">
                                    ${prompt.isPublic ? '<i data-lucide="globe" class="w-4 h-4 text-green-500" title="Public"></i>' : '<i data-lucide="lock" class="w-4 h-4 text-gray-400" title="Private"></i>'}
                                </div>
                            </div>
                            
                            <div class="flex items-center space-x-2 mb-4">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${modeColors[prompt.mode] || 'bg-gray-100 text-gray-800'}">
                                    <i data-lucide="${modeIcons[prompt.mode] || 'file-text'}" class="w-3 h-3 mr-1"></i>
                                    ${prompt.mode.charAt(0).toUpperCase() + prompt.mode.slice(1)}
                                </span>
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    ${prompt.category}
                                </span>
                            </div>
                            
                            ${prompt.tags && prompt.tags.length > 0 ? `
                                <div class="flex flex-wrap gap-1 mb-4">
                                    ${prompt.tags.slice(0, 3).map(tag => `
                                        <span class="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">${tag}</span>
                                    `).join('')}
                                    ${prompt.tags.length > 3 ? `<span class="text-xs text-gray-500">+${prompt.tags.length - 3} more</span>` : ''}
                                </div>
                            ` : ''}
                            
                            <div class="flex items-center justify-between text-sm text-gray-500">
                                <div class="flex items-center space-x-4">
                                    <span class="flex items-center">
                                        <i data-lucide="eye" class="w-4 h-4 mr-1"></i>
                                        ${prompt.views || 0}
                                    </span>
                                    <span class="flex items-center">
                                        <i data-lucide="play" class="w-4 h-4 mr-1"></i>
                                        ${prompt.usage_count || 0}
                                    </span>
                                </div>
                                <div class="text-right">
                                    <div class="font-medium text-gray-700">${prompt.authorName || 'Anonymous'}</div>
                                    <div>${new Date(prompt.created_at).toLocaleDateString()}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            grid.innerHTML = promptsHtml;
            lucide.createIcons();
        }

        // Handle search input
        function handleSearch() {
            currentOffset = 0;
            loadPrompts();
        }

        // Handle filter changes
        function handleFilterChange() {
            currentOffset = 0;
            loadPrompts();
        }

        // Refresh prompts
        function refreshPrompts() {
            currentOffset = 0;
            loadPrompts();
        }

        // Pagination
        function updatePagination(pagination) {
            const info = document.getElementById('paginationInfo');
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');
            const paginationDiv = document.getElementById('pagination');

            if (pagination.total === 0) {
                paginationDiv.classList.add('hidden');
                return;
            }

            paginationDiv.classList.remove('hidden');

            const start = pagination.offset + 1;
            const end = Math.min(pagination.offset + pagination.limit, pagination.total);
            
            info.textContent = `Showing ${start}-${end} of ${pagination.total} prompts`;
            
            prevBtn.disabled = pagination.offset === 0;
            nextBtn.disabled = !pagination.hasMore;
        }

        function previousPage() {
            if (currentOffset > 0) {
                currentOffset = Math.max(0, currentOffset - currentLimit);
                loadPrompts();
            }
        }

        function nextPage() {
            if (currentOffset + currentLimit < totalPrompts) {
                currentOffset += currentLimit;
                loadPrompts();
            }
        }

        // Modal functions
        function openCreateModal() {
            document.getElementById('modalTitle').textContent = 'Create New Prompt';
            document.getElementById('saveButtonText').textContent = 'Save Prompt';
            document.getElementById('promptForm').reset();
            document.getElementById('promptId').value = '';
            document.getElementById('promptModal').classList.remove('hidden');
        }

        function closePromptModal() {
            document.getElementById('promptModal').classList.add('hidden');
        }

        function closeViewModal() {
            document.getElementById('viewModal').classList.add('hidden');
            currentPromptId = null;
        }

        // Handle form submission
        async function handleFormSubmit(e) {
            e.preventDefault();
            
            const promptId = document.getElementById('promptId').value;
            const isEdit = Boolean(promptId);
            
            const formData = {
                title: document.getElementById('promptTitle').value,
                description: document.getElementById('promptDescription').value,
                content: document.getElementById('promptContent').value,
                category: document.getElementById('promptCategory').value,
                mode: document.getElementById('promptMode').value,
                tags: document.getElementById('promptTags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
                isPublic: document.getElementById('promptVisibility').value === 'true',
                authorName: document.getElementById('promptAuthor').value
            };

            // Validate checkbox schema with single content field
            if (formData.mode === 'checkbox') {
                const lines = formData.content.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length < 2 || !/^scenario\s*:/i.test(lines[0])) {
                    alert('For Checkbox mode, the first line must start with "Scenario:" followed by at least one criterion line.');
                    return;
                }
            }
            
            try {
                const url = isEdit ? `/api/prompts/${promptId}` : '/api/prompts';
                const method = isEdit ? 'PUT' : 'POST';
                
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const result = await response.json();
                console.log('📝 Prompt saved:', result);
                
                showSuccess(result.message);
                closePromptModal();
                loadPrompts();
                
            } catch (err) {
                console.error('❌ Failed to save prompt:', err);
                showError(`Failed to save prompt: ${err.message}`);
            }
        }

        // UI adaptation for mode
        function adaptFormForMode() {
            const mode = document.getElementById('promptMode').value;
            const descriptionRow = document.getElementById('descriptionRow');
            const tagsRow = document.getElementById('tagsRow');
            const checkboxExample = document.getElementById('checkboxExample');
            if (mode === 'checkbox') {
                // keep a single content field; show example and stricter placeholder
                document.getElementById('promptContent').placeholder = 'Scenario: ...\nCriterion 1 (optional rubric)\nCriterion 2 (optional rubric)\n...';
                checkboxExample.classList.remove('hidden');
            } else {
                document.getElementById('promptContent').placeholder = 'Enter your AI prompt here. This is the actual text that will be sent to the AI system...';
                checkboxExample.classList.add('hidden');
            }
        }

        // View prompt details
        async function viewPrompt(promptId) {
            try {
                const response = await fetch(`/api/prompts/${promptId}`);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                const prompt = data.prompt;
                currentPromptId = promptId;

                document.getElementById('viewTitle').textContent = prompt.title;
                document.getElementById('viewAuthor').textContent = `By ${prompt.authorName || 'Anonymous Teacher'}`;

                const modeColors = {
                    summary: 'bg-blue-100 text-blue-800',
                    mindmap: 'bg-sky-100 text-sky-800',
                    checkbox: 'bg-green-100 text-green-800'
                };

                document.getElementById('viewContent').innerHTML = `
                    <div class="space-y-6">
                        <div>
                            <h4 class="font-semibold text-gray-900 mb-2">Description</h4>
                            <p class="text-gray-700">${prompt.description || 'No description provided'}</p>
                        </div>
                        
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <h5 class="text-sm font-medium text-gray-500 mb-1">Category</h5>
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                                    ${prompt.category}
                                </span>
                            </div>
                            <div>
                                <h5 class="text-sm font-medium text-gray-500 mb-1">Mode</h5>
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${modeColors[prompt.mode]}">
                                    ${prompt.mode.charAt(0).toUpperCase() + prompt.mode.slice(1)}
                                </span>
                            </div>
                            <div>
                                <h5 class="text-sm font-medium text-gray-500 mb-1">Views</h5>
                                <span class="text-gray-900 font-medium">${prompt.views || 0}</span>
                            </div>
                            <div>
                                <h5 class="text-sm font-medium text-gray-500 mb-1">Uses</h5>
                                <span class="text-gray-900 font-medium">${prompt.usage_count || 0}</span>
                            </div>
                        </div>
                        
                        ${prompt.tags && prompt.tags.length > 0 ? `
                            <div>
                                <h4 class="font-semibold text-gray-900 mb-2">Tags</h4>
                                <div class="flex flex-wrap gap-2">
                                    ${prompt.tags.map(tag => `
                                        <span class="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full">${tag}</span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <div>
                            <h4 class="font-semibold text-gray-900 mb-2">Prompt Content</h4>
                            <div class="bg-gray-50 rounded-lg p-4">
                                <pre class="text-sm text-gray-800 whitespace-pre-wrap font-mono">${prompt.content}</pre>
                            </div>
                        </div>
                        
                        <div class="text-sm text-gray-500">
                            <p>Created: ${new Date(prompt.created_at).toLocaleString()}</p>
                            ${prompt.updated_at !== prompt.created_at ? `<p>Updated: ${new Date(prompt.updated_at).toLocaleString()}</p>` : ''}
                        </div>
                    </div>
                `;

                document.getElementById('viewModal').classList.remove('hidden');
                lucide.createIcons();

            } catch (err) {
                console.error('❌ Failed to load prompt:', err);
                showError(`Failed to load prompt: ${err.message}`);
            }
        }

        // Edit prompt
        function editPrompt() {
            if (!currentPromptId) return;
            
            const prompt = currentPrompts.find(p => p._id === currentPromptId);
            if (!prompt) return;
            
            document.getElementById('modalTitle').textContent = 'Edit Prompt';
            document.getElementById('saveButtonText').textContent = 'Update Prompt';
            document.getElementById('promptId').value = prompt._id;
            document.getElementById('promptTitle').value = prompt.title;
            document.getElementById('promptDescription').value = prompt.description || '';
            document.getElementById('promptContent').value = prompt.content;
            document.getElementById('promptCategory').value = prompt.category;
            document.getElementById('promptMode').value = prompt.mode;
            document.getElementById('promptTags').value = prompt.tags ? prompt.tags.join(', ') : '';
            document.getElementById('promptVisibility').value = prompt.isPublic.toString();
            document.getElementById('promptAuthor').value = prompt.authorName || '';
            
            closeViewModal();
            document.getElementById('promptModal').classList.remove('hidden');
        }

        // Clone prompt
        async function clonePrompt() {
            if (!currentPromptId) return;
            
            try {
                const authorName = prompt('Enter your name for the cloned prompt:', 'Anonymous Teacher');
                if (authorName === null) return; // User cancelled
                
                const response = await fetch(`/api/prompts/${currentPromptId}/clone`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ authorName })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const result = await response.json();
                console.log('📝 Prompt cloned:', result);
                
                showSuccess('Prompt cloned successfully!');
                closeViewModal();
                loadPrompts();
                
            } catch (err) {
                console.error('❌ Failed to clone prompt:', err);
                showError(`Failed to clone prompt: ${err.message}`);
            }
        }

        // Delete prompt
        async function deletePrompt() {
            if (!currentPromptId) return;
            
            if (!confirm('Are you sure you want to delete this prompt? This action cannot be undone.')) {
                return;
            }
            
            try {
                const response = await fetch(`/api/prompts/${currentPromptId}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const result = await response.json();
                console.log('📝 Prompt deleted:', result);
                
                showSuccess('Prompt deleted successfully!');
                closeViewModal();
                loadPrompts();
                
            } catch (err) {
                console.error('❌ Failed to delete prompt:', err);
                showError(`Failed to delete prompt: ${err.message}`);
            }
        }

        function buildPromptRedirectUrl(prompt) {
            if (!prompt) return '/admin.html';
            const mode = (prompt.mode || 'summary').toLowerCase();
            const destination = new URL(
                mode === 'checkbox' ? '/checkbox.html'
                : mode === 'mindmap' ? '/mindmap.html'
                : '/admin.html',
                window.location.origin
            );

            if (mode === 'checkbox') {
                let scenario = typeof prompt.scenario === 'string' ? prompt.scenario.trim() : '';
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
                
                if (scenario) destination.searchParams.set('scenario', scenario);
                if (criteria.length > 0) destination.searchParams.set('criteria', criteria.join('\n'));
                const strictnessValue = Number(prompt.strictness);
                if (Number.isFinite(strictnessValue) && strictnessValue >= 1 && strictnessValue <= 3) {
                    destination.searchParams.set('strictness', String(strictnessValue));
                }
                destination.searchParams.set('mode', 'checkbox');
            } else if (mode === 'mindmap') {
                if (prompt.title) destination.searchParams.set('topic', prompt.title);
                if (prompt.content) destination.searchParams.set('prompt', prompt.content);
                destination.searchParams.set('mode', 'mindmap');
            } else {
                if (prompt.content) destination.searchParams.set('prompt', prompt.content);
                destination.searchParams.set('mode', 'summary');
            }

            return `${destination.pathname}${destination.search}`;
        }

        // Use prompt
        async function usePrompt() {
            if (!currentPromptId) return;
            const prompt = currentPrompts.find(p => p._id === currentPromptId);
            const targetUrl = buildPromptRedirectUrl(prompt);
            
            try {
                const response = await fetch(`/api/prompts/${currentPromptId}/use`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionCode: 'web-interface' })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                try {
                    const result = await response.json();
                    console.log('📝 Prompt used:', result);
                } catch (_) {
                    // Ignore JSON parse errors from empty bodies
                }
            } catch (err) {
                console.error('❌ Failed to record prompt usage:', err);
            } finally {
                window.location.href = targetUrl;
            }
        }

        // Utility functions
        function showSuccess(message) {
            // Simple success notification - you could enhance this with a toast library
            alert(`✅ ${message}`);
        }

        function showError(message) {
            // Simple error notification - you could enhance this with a toast library
            alert(`❌ ${message}`);
        }

        // Close modals on outside click
        document.getElementById('promptModal').addEventListener('click', (e) => {
            if (e.target.id === 'promptModal') {
                closePromptModal();
            }
        });

        document.getElementById('viewModal').addEventListener('click', (e) => {
            if (e.target.id === 'viewModal') {
                closeViewModal();
            }
        });

        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!document.getElementById('promptModal').classList.contains('hidden')) {
                    closePromptModal();
                } else if (!document.getElementById('viewModal').classList.contains('hidden')) {
                    closeViewModal();
                }
            }
        });