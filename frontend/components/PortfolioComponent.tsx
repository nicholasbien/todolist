import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Plus, X, RefreshCw, ArrowUpDown, DollarSign, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface PortfolioProps {
  token: string;
}

interface Holding {
  _id: string;
  symbol: string;
  name: string;
  source: string;
  quantity: number;
  cost_basis: number;
  current_price: number;
  market_value: number;
  gain_loss: number;
  gain_loss_pct: number;
  asset_type: string;
}

interface SourceSummary {
  source: string;
  total_value: number;
  total_cost_basis: number;
  total_gain_loss: number;
  total_gain_loss_pct: number;
  holdings_count: number;
}

interface Contributor {
  symbol: string;
  name: string;
  source: string;
  quantity: number;
  current_price: number;
  market_value: number;
  gain_loss: number;
  gain_loss_pct: number;
  change_type: string;
  has_trades: boolean;
  trade_proceeds: number;
  asset_type: string;
}

interface PortfolioSummary {
  total_value: number;
  total_cost_basis: number;
  total_gain_loss: number;
  total_gain_loss_pct: number;
  sources: Record<string, SourceSummary>;
  holdings: Holding[];
  top_contributors_30d: Contributor[];
  top_contributors_ytd: Contributor[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function GainLossText({ value, className = '' }: { value: number; className?: string }) {
  const color = value >= 0 ? 'text-green-400' : 'text-red-400';
  const sign = value >= 0 ? '+' : '';
  return (
    <span className={`${color} ${className}`}>
      {sign}{formatCurrency(Math.abs(value)).replace('$', '')}
      {value >= 0 ? '' : ''}
    </span>
  );
}

export default function PortfolioComponent({ token }: PortfolioProps) {
  const { authenticatedFetch } = useAuth();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [activeSource, setActiveSource] = useState<string>('Overall');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddHolding, setShowAddHolding] = useState(false);
  const [contributorPeriod, setContributorPeriod] = useState<'30d' | 'ytd'>('30d');

  // Add holding form state
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newSource, setNewSource] = useState('Robinhood');
  const [newQuantity, setNewQuantity] = useState('');
  const [newCostBasis, setNewCostBasis] = useState('');
  const [newCurrentPrice, setNewCurrentPrice] = useState('');
  const [newPrice30d, setNewPrice30d] = useState('');
  const [newPriceYtd, setNewPriceYtd] = useState('');
  const [newAssetType, setNewAssetType] = useState('stock');
  const [addingHolding, setAddingHolding] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const sourceParam = activeSource !== 'Overall' ? `?source=${encodeURIComponent(activeSource)}` : '';
      const [summaryResp, sourcesResp] = await Promise.all([
        authenticatedFetch(`/portfolio/summary${sourceParam}`),
        authenticatedFetch('/portfolio/sources'),
      ]);

      if (!summaryResp?.ok || !sourcesResp?.ok) {
        throw new Error('Failed to fetch portfolio data');
      }

      const summaryData = await summaryResp.json();
      const sourcesData = await sourcesResp.json();

      setSummary(summaryData);
      setSources(sourcesData);
    } catch (err: any) {
      setError(err.message || 'Error loading portfolio');
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, activeSource]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim() || !newName.trim() || !newQuantity || !newCostBasis) return;

    try {
      setAddingHolding(true);
      const resp = await authenticatedFetch('/portfolio/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: newSymbol.trim().toUpperCase(),
          name: newName.trim(),
          source: newSource,
          quantity: parseFloat(newQuantity),
          cost_basis: parseFloat(newCostBasis),
          current_price: parseFloat(newCurrentPrice) || 0,
          price_30d_ago: parseFloat(newPrice30d) || 0,
          price_ytd_start: parseFloat(newPriceYtd) || 0,
          asset_type: newAssetType,
        }),
      });

      if (!resp?.ok) throw new Error('Failed to add holding');

      // Reset form and refresh
      setNewSymbol('');
      setNewName('');
      setNewQuantity('');
      setNewCostBasis('');
      setNewCurrentPrice('');
      setNewPrice30d('');
      setNewPriceYtd('');
      setShowAddHolding(false);
      fetchPortfolio();
    } catch (err: any) {
      setError(err.message || 'Error adding holding');
    } finally {
      setAddingHolding(false);
    }
  };

  const handleDeleteHolding = async (holdingId: string) => {
    try {
      const resp = await authenticatedFetch(`/portfolio/holdings/${holdingId}`, {
        method: 'DELETE',
      });
      if (!resp?.ok) throw new Error('Failed to delete holding');
      fetchPortfolio();
    } catch (err: any) {
      setError(err.message || 'Error deleting holding');
    }
  };

  const allTabs = ['Overall', ...sources];

  if (loading && !summary) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-400">Loading portfolio...</p>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchPortfolio}
          className="border border-accent text-accent px-4 py-2 rounded-lg hover:bg-accent/10 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const contributors = contributorPeriod === '30d'
    ? summary?.top_contributors_30d || []
    : summary?.top_contributors_ytd || [];

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Portfolio Value Header */}
      <div className="text-center">
        <p className="text-gray-400 text-sm mb-1">
          {activeSource === 'Overall' ? 'Total Portfolio' : activeSource}
        </p>
        <p className="text-3xl font-bold text-gray-100">
          {formatCurrency(summary?.total_value || 0)}
        </p>
        <div className="flex items-center justify-center gap-2 mt-1">
          {(summary?.total_gain_loss || 0) >= 0 ? (
            <TrendingUp className="w-4 h-4 text-green-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-400" />
          )}
          <GainLossText value={summary?.total_gain_loss || 0} />
          <span className={`text-sm ${(summary?.total_gain_loss_pct || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ({formatPct(summary?.total_gain_loss_pct || 0)})
          </span>
        </div>
      </div>

      {/* Source Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {allTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSource(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ${
              activeSource === tab
                ? 'bg-gray-900 text-accent border border-accent'
                : 'bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-800'
            }`}
          >
            {tab}
            {tab !== 'Overall' && summary?.sources[tab] && (
              <span className="ml-1.5 text-xs text-gray-500">
                ({summary.sources[tab].holdings_count})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Source Breakdown (only on Overall tab) */}
      {activeSource === 'Overall' && Object.keys(summary?.sources || {}).length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {Object.values(summary?.sources || {}).map((src) => (
            <button
              key={src.source}
              onClick={() => setActiveSource(src.source)}
              className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-left hover:border-gray-700 transition-colors"
            >
              <p className="text-gray-400 text-xs font-medium mb-1">{src.source}</p>
              <p className="text-gray-100 font-semibold text-sm">{formatCurrency(src.total_value)}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <GainLossText value={src.total_gain_loss} className="text-xs" />
                <span className={`text-xs ${src.total_gain_loss_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ({formatPct(src.total_gain_loss_pct)})
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Top Contributors Section */}
      {contributors.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-100 font-semibold text-sm">Top Contributors</h3>
            <div className="flex bg-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setContributorPeriod('30d')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  contributorPeriod === '30d'
                    ? 'bg-gray-700 text-accent'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                30D
              </button>
              <button
                onClick={() => setContributorPeriod('ytd')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  contributorPeriod === 'ytd'
                    ? 'bg-gray-700 text-accent'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                YTD
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {contributors.map((c, idx) => (
              <div
                key={`${c.symbol}-${c.source}-${idx}`}
                className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-100 font-medium text-sm">{c.symbol}</span>
                    <span className="text-gray-500 text-xs truncate">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-gray-500 text-xs">{c.source}</span>
                    {c.has_trades ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800">
                        Trade + Price
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                        Price Change
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {c.gain_loss >= 0 ? (
                      <TrendingUp className="w-3 h-3 text-green-400" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-red-400" />
                    )}
                    <GainLossText value={c.gain_loss} className="text-sm font-medium" />
                  </div>
                  <span className={`text-xs ${c.gain_loss_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPct(c.gain_loss_pct)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {contributors.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">
              No performance data available. Add price history to your holdings.
            </p>
          )}
        </div>
      )}

      {/* Holdings List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-gray-100 font-semibold text-sm">
            Holdings
            {summary?.holdings.length ? ` (${summary.holdings.length})` : ''}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={fetchPortfolio}
              className="p-2 text-gray-400 hover:text-accent transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowAddHolding(true)}
              className="flex items-center gap-1 border border-accent text-accent px-3 py-1.5 rounded-lg text-xs hover:bg-accent/10 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Holding
            </button>
          </div>
        </div>

        {(!summary?.holdings || summary.holdings.length === 0) ? (
          <div className="text-center py-8 bg-gray-900 border border-gray-800 rounded-xl">
            <DollarSign className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm mb-2">No holdings yet</p>
            <p className="text-gray-500 text-xs mb-4">Add your investment holdings to track your portfolio</p>
            <button
              onClick={() => setShowAddHolding(true)}
              className="border border-accent text-accent px-4 py-2 rounded-lg text-sm hover:bg-accent/10 transition-colors"
            >
              Add Your First Holding
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.holdings.map((h) => (
              <div
                key={h._id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-100 font-medium">{h.symbol}</span>
                    <span className="text-gray-500 text-xs truncate">{h.name}</span>
                    <span className="text-gray-600 text-xs">{h.source}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{h.quantity} shares</span>
                    <span>@ {formatCurrency(h.current_price)}</span>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="text-gray-100 font-medium text-sm">{formatCurrency(h.market_value)}</p>
                    <div className="flex items-center justify-end gap-1">
                      <GainLossText value={h.gain_loss} className="text-xs" />
                      <span className={`text-xs ${h.gain_loss_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ({formatPct(h.gain_loss_pct)})
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteHolding(h._id)}
                    className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                    title="Delete holding"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Holding Modal */}
      {showAddHolding && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" style={{ overscrollBehavior: 'contain' }}>
          <div className="bg-black border border-gray-800 p-6 rounded-xl w-full max-w-md space-y-4 shadow-2xl overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 2rem)' }}>
            <h3 className="text-gray-100 text-lg font-bold">Add Holding</h3>
            <form onSubmit={handleAddHolding} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Symbol</label>
                  <input
                    type="text"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    placeholder="AAPL"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-accent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Apple Inc."
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-accent"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Source</label>
                  <select
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="Robinhood">Robinhood</option>
                    <option value="Coinbase">Coinbase</option>
                    <option value="Fidelity">Fidelity</option>
                    <option value="Charles Schwab">Charles Schwab</option>
                    <option value="Vanguard">Vanguard</option>
                    <option value="E*TRADE">E*TRADE</option>
                    <option value="TD Ameritrade">TD Ameritrade</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Asset Type</label>
                  <select
                    value={newAssetType}
                    onChange={(e) => setNewAssetType(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="stock">Stock</option>
                    <option value="crypto">Crypto</option>
                    <option value="etf">ETF</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    placeholder="10"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-accent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Total Cost Basis</label>
                  <input
                    type="number"
                    step="any"
                    value={newCostBasis}
                    onChange={(e) => setNewCostBasis(e.target.value)}
                    placeholder="1500.00"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-accent"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Current Price</label>
                <input
                  type="number"
                  step="any"
                  value={newCurrentPrice}
                  onChange={(e) => setNewCurrentPrice(e.target.value)}
                  placeholder="175.50"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Price 30 Days Ago</label>
                  <input
                    type="number"
                    step="any"
                    value={newPrice30d}
                    onChange={(e) => setNewPrice30d(e.target.value)}
                    placeholder="170.00"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Price at YTD Start</label>
                  <input
                    type="number"
                    step="any"
                    value={newPriceYtd}
                    onChange={(e) => setNewPriceYtd(e.target.value)}
                    placeholder="155.00"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="flex justify-center space-x-3 pt-2">
                <button
                  type="submit"
                  disabled={addingHolding || !newSymbol.trim() || !newQuantity}
                  className="border border-accent text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg transition-colors"
                >
                  {addingHolding ? 'Adding...' : 'Add Holding'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddHolding(false)}
                  className="border border-gray-600 text-gray-300 hover:bg-gray-800 px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-center">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
