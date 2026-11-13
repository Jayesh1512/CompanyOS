import {escapeHtml as e} from './domain.js';

// Shared markup uses the workspace's existing loading and empty-state styles.
export const renderLoadingState=(message='Loading your workspace…')=>`<div class="loading-state" role="status" aria-live="polite"><div></div><div></div><div></div><p>${e(message)}</p></div>`;
export const renderEmptyState=(title,body,action='',symbol='')=>`<div class="empty-state">${symbol}<h3>${e(title)}</h3><p>${e(body)}</p>${action}</div>`;
