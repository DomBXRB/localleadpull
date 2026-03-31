import { useState, useEffect, useCallback } from 'react';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

const NICHES = [
  'HVAC',
  'Plumbing',
  'Roofing',
  'Electrician',
  'Tree Removal',
  'Dentist',
  'Med Spa',
  'Chiropractor',
  'Pest Control',
  'Landscaping',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

function StarRating({ rating }) {
  if (!rating) return <span className="no-rating">No rating</span>;
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="stars" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(empty)}
      <span className="rating-num">{rating.toFixed(1)}</span>
    </span>
  );
}

function ResultCard({ business, locked }) {
  return (
    <div className={`result-card${locked ? ' locked' : ''}`}>
      {locked && (
        <div className="lock-overlay">
          <span className="lock-icon">🔒</span>
          <span className="lock-text">Unlock full list</span>
        </div>
      )}
      <div className="card-content">
        <h3 className="biz-name">{business.name || '—'}</h3>
        <div className="biz-detail">
          <span className="detail-label">Phone</span>
          <span className="detail-value">
            {business.phone
              ? <a href={`tel:${business.phone}`}>{business.phone}</a>
              : '—'}
          </span>
        </div>
        <div className="biz-detail">
          <span className="detail-label">Website</span>
          <span className="detail-value website">
            {business.website
              ? (
                <a href={business.website} target="_blank" rel="noreferrer">
                  {business.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              ) : '—'}
          </span>
        </div>
        <div className="biz-detail">
          <span className="detail-label">Rating</span>
          <span className="detail-value rating-row">
            <StarRating rating={business.rating} />
            {business.reviewCount != null && (
              <span className="review-count">({business.reviewCount})</span>
            )}
          </span>
        </div>
        {business.address && (
          <div className="biz-detail">
            <span className="detail-label">Address</span>
            <span className="detail-value address">{business.address}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [searchKey, setSearchKey] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleDownloadAfterPayment = useCallback(async (sessionId) => {
    try {
      const res = await fetch(`${API_BASE}/api/download?session_id=${sessionId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Download failed. Please contact support.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition');
      const filename = cd
        ? cd.split('filename=')[1]?.replace(/"/g, '')
        : 'leads.csv';
      a.download = filename || 'leads.csv';
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMessage('Payment successful! Your CSV is downloading.');
    } catch {
      setError('Download failed. Please contact support.');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const success = params.get('success');
    if (success === 'true' && sessionId) {
      window.history.replaceState({}, '', '/');
      handleDownloadAfterPayment(sessionId);
    }
    if (params.get('canceled') === 'true') {
      window.history.replaceState({}, '', '/');
      setError('Payment was canceled. You can try again anytime.');
    }
  }, [handleDownloadAfterPayment]);

  async function handleGenerate(e) {
    e.preventDefault();
    if (!niche || !city.trim() || !state) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setSuccessMessage('');
    setResults(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ niche, city: city.trim(), state });
      const res = await fetch(`${API_BASE}/api/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.preview);
      setSearchKey(data.searchKey);
      setTotalCount(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout() {
    if (!searchKey) return;
    setCheckoutLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchKey, niche, city, state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setCheckoutLoading(false);
    }
  }

  const lockedCount = Math.min(3, Math.max(0, totalCount - 5));

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-mark">📍</span>
            <span className="logo-name">LocalLeadPull</span>
          </div>
          <p className="tagline">Pull local business leads in seconds</p>
        </div>
      </header>

      <main className="main">
        <section className="search-section">
          <form className="search-form" onSubmit={handleGenerate}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="niche">Business Type</label>
                <select
                  id="niche"
                  value={niche}
                  onChange={e => setNiche(e.target.value)}
                  required
                >
                  <option value="">Select a niche…</option>
                  {NICHES.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  type="text"
                  placeholder="e.g. Dallas"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group form-group--sm">
                <label htmlFor="state">State</label>
                <select
                  id="state"
                  value={state}
                  onChange={e => setState(e.target.value)}
                  required
                >
                  <option value="">ST</option>
                  {US_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="btn btn--primary"
                disabled={loading}
              >
                {loading ? (
                  <span className="btn-inner">
                    <span className="spinner" />
                    Searching…
                  </span>
                ) : 'Generate'}
              </button>
            </div>
          </form>

          {error && <div className="alert alert--error">{error}</div>}
          {successMessage && <div className="alert alert--success">{successMessage}</div>}
        </section>

        {results && (
          <section className="results-section">
            <div className="results-header">
              <div className="results-meta">
                <h2 className="results-title">
                  {niche} in {city}, {state}
                </h2>
                <p className="results-sub">
                  Showing 5 of {totalCount} results
                </p>
              </div>
              <button
                className="btn btn--cta"
                onClick={handleCheckout}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? (
                  <span className="btn-inner">
                    <span className="spinner spinner--white" />
                    Redirecting…
                  </span>
                ) : (
                  <>
                    <span>Download Full CSV</span>
                    <span className="price-badge">$5</span>
                  </>
                )}
              </button>
            </div>

            <div className="results-grid">
              {results.map((biz, i) => (
                <ResultCard key={biz.placeId || i} business={biz} locked={false} />
              ))}
              {[...Array(lockedCount)].map((_, i) => (
                <ResultCard
                  key={`locked-${i}`}
                  business={{
                    name: '████████ ████',
                    phone: '███-███-████',
                    website: '████████.com',
                    rating: null,
                  }}
                  locked
                />
              ))}
            </div>

            {totalCount > 5 && (
              <div className="cta-banner">
                <div className="cta-banner-body">
                  <p className="cta-banner-headline">
                    <strong>{totalCount - 5} more leads</strong> ready to download
                  </p>
                  <p className="cta-banner-sub">
                    Get every result — name, phone, website, rating — as a clean CSV
                  </p>
                </div>
                <button
                  className="btn btn--cta"
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? 'Redirecting…' : 'Get Full List — $5'}
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="footer">
        <p>© {new Date().getFullYear()} LocalLeadPull · Powered by Google Places</p>
      </footer>
    </div>
  );
}
