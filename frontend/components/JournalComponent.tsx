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
  updated_offline?: boolean;
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
        ? `/api/journals?date=${date}&space_id=${activeSpace._id}`
        : `/api/journals?date=${date}`;

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

      const response = await authenticatedFetch('/api/journals', {
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

    if (journalText !== lastSavedText && journalText.trim()) {
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
  }, [journalText, lastSavedText]); // Removed saveJournalEntry and saveTimeout to prevent infinite loop

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
    if (journalText !== lastSavedText && journalText.trim()) return 'Unsaved changes';
    if (currentEntry?.created_offline || currentEntry?.updated_offline)
      return isOffline ? 'Saved offline' : 'Syncing...';
    if (lastSavedText) return 'Synced online';
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
    <div className="space-y-6">

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Date Picker */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="journal-date" className="text-sm text-gray-400">Date:</label>
          <button
            type="button"
            onClick={() => adjustDate(-1)}
            aria-label="Previous day"
            className="bg-gray-900 border border-gray-700 text-gray-100 px-3 py-2 rounded-lg hover:bg-gray-800"
          >
            ←
          </button>
          <input
            id="journal-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-100 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
            style={{ colorScheme: 'dark' }}
          />
          <button
            type="button"
            onClick={() => adjustDate(1)}
            aria-label="Next day"
            className="bg-gray-900 border border-gray-700 text-gray-100 px-3 py-2 rounded-lg hover:bg-gray-800"
          >
            →
          </button>
        </div>

        <div className="flex-1"></div>

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
        <div className="space-y-4">
          {/* Journal Text Area */}
          <div className="relative">
            <textarea
              value={journalText}
              onChange={(e) => setJournalText(e.target.value)}
              placeholder={`Write about your day on ${formatDateForDisplay(selectedDate)}...`}
              className="w-full h-64 p-4 bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleManualSave}
              disabled={saving || !journalText.trim()}
              className="bg-accent text-foreground px-6 py-2 rounded-lg hover:bg-accent-light disabled:bg-accent-dark disabled:text-gray-400 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Entry'}
            </button>

          </div>


          {/* Entry Meta Info */}
          {currentEntry && (
            <div className="text-xs text-gray-500 space-y-1">
              <div>Created: {new Date(currentEntry.created_at).toLocaleString()}</div>
              {currentEntry.updated_at !== currentEntry.created_at && (
                <div>Updated: {new Date(currentEntry.updated_at).toLocaleString()}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
