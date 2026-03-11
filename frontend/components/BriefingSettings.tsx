import React, { useState, useEffect, useCallback } from "react";

interface BriefingSettingsProps {
  token: string;
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
  onClose: () => void;
}

interface BriefingPreferences {
  enabled: boolean;
  hour: number;
  minute: number;
  timezone: string;
  stale_threshold_days: number;
}

export default function BriefingSettings({
  token,
  authenticatedFetch,
  onClose,
}: BriefingSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [enabled, setEnabled] = useState(false);
  const [briefingTime, setBriefingTime] = useState("08:00");
  const [staleThresholdDays, setStaleThresholdDays] = useState(3);

  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await authenticatedFetch("/briefings/preferences");
      if (!response.ok) throw new Error("Failed to load briefing preferences");
      const data: BriefingPreferences = await response.json();
      setEnabled(data.enabled);
      const h = String(data.hour).padStart(2, "0");
      const m = String(data.minute).padStart(2, "0");
      setBriefingTime(`${h}:${m}`);
      setStaleThresholdDays(data.stale_threshold_days);
    } catch (err: any) {
      setError(err.message || "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      const [hour, minute] = briefingTime.split(":").map((v) => parseInt(v, 10));
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const response = await authenticatedFetch("/briefings/preferences", {
        method: "POST",
        body: JSON.stringify({
          enabled,
          hour,
          minute,
          timezone: userTimezone,
          stale_threshold_days: staleThresholdDays,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to save preferences");
      }

      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload original values and close
    await loadPreferences();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-black border border-gray-800 rounded-xl p-6 w-80 text-gray-100 space-y-4 shadow-2xl">
        <h3 className="text-gray-100 text-lg font-bold mb-2">
          Briefing Settings
        </h3>

        {loading ? (
          <div className="text-gray-400 text-sm py-4 text-center">
            Loading...
          </div>
        ) : (
          <>
            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded p-2">
                {error}
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="briefingEnabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 text-accent bg-gray-900 border-gray-700 rounded focus:ring-accent focus:ring-2"
              />
              <label
                htmlFor="briefingEnabled"
                className="text-sm text-gray-300"
              >
                Enable daily briefings
              </label>
            </div>

            <p className="text-xs text-gray-500">
              Get a daily summary of your tasks, completions, and stale items
              posted to the Assistant tab.
            </p>

            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Briefing Time
              </label>
              <input
                type="time"
                value={briefingTime}
                onChange={(e) => setBriefingTime(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-gray-100 p-2 rounded-lg focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!enabled}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Stale Task Threshold
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min={1}
                  max={14}
                  value={staleThresholdDays}
                  onChange={(e) =>
                    setStaleThresholdDays(parseInt(e.target.value, 10))
                  }
                  className="flex-1 accent-accent disabled:opacity-50"
                  disabled={!enabled}
                />
                <span className="text-sm text-gray-300 w-16 text-right">
                  {staleThresholdDays} day{staleThresholdDays !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Tasks with no activity for this many days will be flagged.
              </p>
            </div>

            <div className="flex justify-center space-x-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="border border-accent text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleCancel}
                className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
