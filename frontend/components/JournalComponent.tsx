import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';

interface JournalProps {
  token: string;
  activeSpace: any;
}

interface JournalEntry {
  _id?: string;
  user_id: string;
  space_id?: string;
  date: string;
  text: string;
  created_at: string;
  updated_at: string;
  created_offline?: boolean;
  updated_offline?: boolean; // true if the entry was last updated while offline
}

export default function JournalComponent({ token, activeSpace }: JournalProps) {
  const { authenticatedFetch } = useAuth();
  const isOffline = useOffline();
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today's date in user's local timezone in YYYY-MM-DD format
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [journalText, setJournalText] = useState<string>('');
  const [currentEntry, setCurrentEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [lastSavedText, setLastSavedText] = useState<string>('');

  // Auto-save timeout
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);

  const fetchJournalEntry = useCallback(async (date: string) => {
    if (!authenticatedFetch) return;

    try {
      setLoading(true);
      setError('');

      const url = activeSpace?._id
        ? `/journals?date=${date}&space_id=${activeSpace._id}`
        : `/journals?date=${date}`;

      const response = await authenticatedFetch(url);

      if (!response?.ok) {
        throw new Error('Failed to fetch journal entry');
      }

      const data = await response.json();

      if (data) {
        setCurrentEntry(data);
        setJournalText(data.text || '');
        setLastSavedText(data.text || '');
      } else {
        // No entry for this date
        setCurrentEntry(null);
        setJournalText('');
        setLastSavedText('');
      }

    } catch (err: any) {
      setError(err.message || 'Error loading journal entry');
      setCurrentEntry(null);
      setJournalText('');
      setLastSavedText('');
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, activeSpace]);

  // Fetch entry when date or space changes
  useEffect(() => {
    if (selectedDate) {
      fetchJournalEntry(selectedDate);
    }
  }, [selectedDate, fetchJournalEntry]);

  const saveJournalEntry = useCallback(async (text: string, showSaving: boolean = false) => {
    if (!authenticatedFetch || text === lastSavedText) return;

    try {
      if (showSaving) setSaving(true);
      setError('');

      const requestBody = {
        date: selectedDate,
        text: text.trim(),
        space_id: activeSpace?._id || null
      };

      const response = await authenticatedFetch('/journals', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      if (!response?.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save journal entry');
      }

      const savedEntry = await response.json();
      setCurrentEntry(savedEntry);
      setLastSavedText(text);

    } catch (err: any) {
      setError(err.message || 'Error saving journal entry');
    } finally {
      if (showSaving) setSaving(false);
    }
  }, [authenticatedFetch, selectedDate, activeSpace, lastSavedText]);

  // Auto-save functionality
  useEffect(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    if (journalText !== lastSavedText) {
      const timeout = setTimeout(() => {
        saveJournalEntry(journalText, false);
      }, 2000); // Auto-save after 2 seconds of inactivity

      setSaveTimeout(timeout);
    }

    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [journalText, lastSavedText, saveJournalEntry, saveTimeout]);

  // Refresh journal entry after offline sync completes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE' && currentEntry?.updated_offline) {
        fetchJournalEntry(selectedDate);
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
    }

    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      }
    };
  }, [currentEntry, fetchJournalEntry, selectedDate]);

  const handleManualSave = async () => {
    // Allow saving even if empty
    await saveJournalEntry(journalText, true);
  };



  const formatDateForDisplay = (dateString: string) => {
    // Parse the date string as YYYY-MM-DD and create date in local timezone
    const [year, month, day] = dateString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getSaveStatus = () => {
    if (saving) return 'Saving...';
    if (journalText !== lastSavedText) return 'Unsaved changes';
    if (currentEntry?.updated_offline) return isOffline ? 'Saved offline' : 'Syncing...';
    if (lastSavedText || currentEntry) return 'Synced online';
    return '';
  };

  const adjustDate = (days: number) => {
    const [year, month, day] = selectedDate.split('-').map((num) => parseInt(num, 10));
    const newDate = new Date(year, month - 1, day);
    newDate.setDate(newDate.getDate() + days);
    const newYear = newDate.getFullYear();
    const newMonth = String(newDate.getMonth() + 1).padStart(2, '0');
    const newDay = String(newDate.getDate()).padStart(2, '0');
    setSelectedDate(`${newYear}-${newMonth}-${newDay}`);
  };

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-xl mb-4 flex-shrink-0 flex justify-between items-start">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError('')}
            className="text-red-300 hover:text-red-100 ml-2 flex-shrink-0 text-lg leading-none"
            aria-label="Close error message"
          >
            ×
          </button>
        </div>
      )}

      {/* Date Picker */}
      <div className="flex flex-col items-center space-y-2 mb-4 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => adjustDate(-1)}
            aria-label="Previous day"
            className="bg-gray-900 border border-gray-700 text-gray-100 h-10 w-10 rounded-lg hover:bg-gray-800 flex items-center justify-center"
          >
            &lt;
          </button>
          <input
            id="journal-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-100 px-4 h-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-center min-w-[160px]"
            style={{ colorScheme: 'dark' }}
          />
          <button
            type="button"
            onClick={() => adjustDate(1)}
            aria-label="Next day"
            className="bg-gray-900 border border-gray-700 text-gray-100 h-10 w-10 rounded-lg hover:bg-gray-800 flex items-center justify-center"
          >
            &gt;
          </button>
        </div>

        <div className="text-sm text-gray-400">
          {getSaveStatus()}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4 text-4xl">📖</div>
          <p className="text-gray-400">Loading journal entry...</p>
        </div>
      ) : (
        <>
          {/* Journal Text Area - fills remaining space */}
          <div className="flex-1 mb-4" style={{ minHeight: 0 }}>
            <textarea
              value={journalText}
              onChange={(e) => setJournalText(e.target.value)}
              placeholder={`Write about your day on ${formatDateForDisplay(selectedDate)}...`}
              className="w-full h-full p-4 bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent resize-none overflow-y-auto custom-scrollbar"
            />
          </div>

          {/* Save button and meta info at bottom */}
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              {/* Entry Meta Info */}
              {currentEntry && (
                <div className="text-xs text-gray-500 space-y-1">
                  <div>Created: {new Date(currentEntry.created_at).toLocaleString()}</div>
                  {currentEntry.updated_at !== currentEntry.created_at && (
                    <div>Updated: {new Date(currentEntry.updated_at).toLocaleString()}</div>
                  )}
                </div>
              )}
              {!currentEntry && <div></div>}

              {/* Save button on the right */}
              <button
                onClick={handleManualSave}
                disabled={saving || journalText === lastSavedText}
                className="bg-accent text-foreground px-6 py-3 rounded-lg hover:bg-accent-light disabled:bg-accent-dark disabled:text-gray-400 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
