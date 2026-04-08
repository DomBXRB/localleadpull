import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

const NICHES = [
  'HVAC', 'Plumbing', 'Roofing', 'Electrician', 'Tree Removal',
  'Dentist', 'Med Spa', 'Chiropractor', 'Pest Control', 'Landscaping',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];


function Logo() {
  return (
    <svg width="26" height="30" viewBox="0 0 26 30" fill="none" aria-hidden="true">
      <circle cx="13" cy="11" r="9" stroke="#3B82F6" strokeWidth="2.5" fill="none" />
      <circle cx="13" cy="11" r="3.5" fill="#3B82F6" />
      <path d="M13 20 L13 29" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg className="row-icon" width="13" height="16" viewBox="0 0 13 16" fill="none" aria-hidden="true">
      <path d="M6.5 0C3.46 0 1 2.46 1 5.5c0 4.12 5.5 10.5 5.5 10.5S12 9.62 12 5.5C12 2.46 9.54 0 6.5 0z" fill="#6b7280" />
      <circle cx="6.5" cy="5.5" r="1.8" fill="#1a1a1a" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="row-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 1.5h2.8l1.4 3.2-1.8 1.4a8.4 8.4 0 003 3l1.4-1.8 3.2 1.4v2.8c0 .6-.4 1-1 1C5 12.5 1.5 9 1.5 2.5c0-.6.4-1 1-1z" fill="#6b7280" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="row-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="#6b7280" strokeWidth="1.4" />
      <path d="M7 1.5c0 0-2.5 2-2.5 5.5s2.5 5.5 2.5 5.5M7 1.5c0 0 2.5 2 2.5 5.5S7 12.5 7 12.5M1.5 7h11" stroke="#6b7280" strokeWidth="1.4" />
    </svg>
  );
}

function StarRating({ rating, reviewCount }) {
  if (!rating) return <span className="no-rating">No rating</span>;

  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const full = i <= Math.floor(rating);
    const half = !full && i - 0.5 <= rating;
    stars.push(
      <span key={i} className={`star ${full ? 'star--full' : half ? 'star--half' : 'star--empty'}`}>
        ★
      </span>
    );
  }

  return (
    <span className="stars-container">
      <span className="stars-row">{stars}</span>
      <span className="rating-num">{rating.toFixed(1)}</span>
      {reviewCount != null && <span className="review-count">({reviewCount})</span>}
    </span>
  );
}

function ResultCard({ business, locked }) {
  return (
    <div className={`result-card${locked ? ' locked' : ''}`}>
      {locked && (
        <div className="lock-overlay">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" stroke="#6b7280" strokeWidth="2" />
            <path d="M8 11V7a4 4 0 018 0v4" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="lock-text">Unlock to reveal</span>
        </div>
      )}
      <div className="card-content">
        <h3 className="biz-name">{business.name || '—'}</h3>

        {business.address && (
          <div className="biz-row">
            <MapPinIcon />
            <span className="biz-address">{business.address}</span>
          </div>
        )}

        <div className="biz-row">
          <PhoneIcon />
          {business.phone
            ? <a className="biz-link" href={`tel:${business.phone}`}>{business.phone}</a>
            : <span className="no-data">No phone</span>}
        </div>

        <div className="biz-row">
          <GlobeIcon />
          {business.website
            ? (
              <a
                className="biz-link biz-website-link"
                href={business.website}
                target="_blank"
                rel="noreferrer"
              >
                {business.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )
            : <span className="no-data">No website</span>}
        </div>

        <div className="biz-row biz-row--stars">
          <StarRating rating={business.rating} reviewCount={business.reviewCount} />
        </div>
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
  const [tierLoading, setTierLoading] = useState(false);
  const [pendingTier, setPendingTier] = useState(null); // { requestedCount, price, available }
  const [confirming, setConfirming] = useState(false);

  const [isAdmin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === 'localleadpull2026';
  });

  const toolRef = useRef(null);
  const pricingRef = useRef(null);

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
      const filename = cd ? cd.split('filename=')[1]?.replace(/"/g, '') : 'leads.csv';
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
    const adminParam = params.get('admin');
    const cleanUrl = adminParam ? `?admin=${adminParam}` : '/';

    if (success === 'true' && sessionId) {
      window.history.replaceState({}, '', cleanUrl);
      handleDownloadAfterPayment(sessionId);
    }
    if (params.get('canceled') === 'true') {
      window.history.replaceState({}, '', cleanUrl);
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
    setPendingTier(null);
    setConfirming(false);
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

  async function handleCheckout(requestedCount) {
    setCheckoutLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchKey, niche, city, state, requestedCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setCheckoutLoading(false);
    }
  }

  async function handleSelectTier(requestedCount, price) {
    if (!searchKey) return;
    setTierLoading(true);
    setError('');
    setPendingTier(null);
    setConfirming(false);
    try {
      const res = await fetch(`${API_BASE}/api/check-availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchKey, requestedCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Availability check failed');
      if (data.sufficient) {
        await handleCheckout(requestedCount);
      } else {
        setPendingTier({ requestedCount, price, available: data.available });
        setConfirming(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTierLoading(false);
    }
  }

  async function handleAdminDownload() {
    if (!searchKey) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/admin-download?search_key=${searchKey}&admin=localleadpull2026`
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Admin download failed.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition');
      const filename = cd ? cd.split('filename=')[1]?.replace(/"/g, '') : 'leads.csv';
      a.download = filename || 'leads.csv';
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMessage('Admin download complete!');
    } catch {
      setError('Admin download failed. Please try again.');
    }
  }

  function scrollToPricing(e) {
    e.preventDefault();
    pricingRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function scrollToTool() {
    toolRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  const lockedCount = Math.min(3, Math.max(0, totalCount - 3));

  return (
    <div className="app">

      {/* ── NAVBAR ─────────────────────────────────────────────── */}
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="nav-logo">
            <Logo />
            <span className="nav-brand">LocalLeadPull</span>
          </div>
          <a href="#pricing" className="nav-link" onClick={scrollToPricing}>
            Pricing
          </a>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-inner">
          <h1 className="hero-headline">Stop Wasting Hours on Google Maps</h1>
          <p className="hero-sub">
            Pull verified local business leads in seconds — name, phone, website,
            rating, address — ready to dial.
          </p>
          <button className="btn btn--hero" onClick={scrollToTool}>
            Try It Free
          </button>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────── */}
      <section className="how-section">
        <div className="section-inner">
          <h2 className="section-title">How It Works</h2>
          <div className="steps-row">

            <div className="step">
              <div className="step-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                  <circle cx="11" cy="11" r="7" stroke="#3B82F6" strokeWidth="2" />
                  <path d="M21 21l-4.35-4.35" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="step-num">1</div>
              <h3 className="step-title">Search</h3>
              <p className="step-desc">Pick your niche and city</p>
            </div>

            <div className="step-connector" aria-hidden="true">
              <svg width="36" height="14" viewBox="0 0 36 14" fill="none">
                <path d="M0 7h32" stroke="#2a2a2a" strokeWidth="2" />
                <path d="M26 1l6 6-6 6" stroke="#2a2a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div className="step">
              <div className="step-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="#3B82F6" strokeWidth="2" />
                  <path d="M7 8h10M7 12h7M7 16h9" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="step-num">2</div>
              <h3 className="step-title">Preview</h3>
              <p className="step-desc">See 3 free leads instantly</p>
            </div>

            <div className="step-connector" aria-hidden="true">
              <svg width="36" height="14" viewBox="0 0 36 14" fill="none">
                <path d="M0 7h32" stroke="#2a2a2a" strokeWidth="2" />
                <path d="M26 1l6 6-6 6" stroke="#2a2a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div className="step">
              <div className="step-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                  <path d="M12 3v13M7 12l5 5 5-5" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 20h16" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="step-num">3</div>
              <h3 className="step-title">Download</h3>
              <p className="step-desc">Pay once, get the full list as CSV</p>
            </div>

          </div>
        </div>
      </section>

      {/* ── TOOL ───────────────────────────────────────────────── */}
      <section className="tool-section" ref={toolRef} id="tool">
        <div className="section-inner">

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
                  {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
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
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading
                  ? <span className="btn-inner"><span className="spinner" />Searching…</span>
                  : 'Generate'}
              </button>
            </div>
          </form>

          {error && <div className="alert alert--error">{error}</div>}
          {successMessage && <div className="alert alert--success">{successMessage}</div>}

          {results && (
            <div className="results-section">
              <div className="results-header">
                <div>
                  <h2 className="results-title">{niche} in {city}, {state}</h2>
                  <p className="results-sub">Showing 3 of {totalCount} results</p>
                </div>
                {isAdmin && (
                  <button className="btn btn--primary" onClick={handleAdminDownload}>
                    Download CSV (Admin)
                  </button>
                )}
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

              {totalCount > 3 && !isAdmin && !confirming && (
                <div className="tier-picker">
                  <p className="tier-picker-label">How many leads do you want?</p>
                  <div className="tier-row">
                    {[
                      { count: 20,  price: 5  },
                      { count: 50,  price: 15 },
                      { count: 100, price: 25 },
                    ].map(({ count, price }) => (
                      <button
                        key={count}
                        className="tier-btn"
                        onClick={() => handleSelectTier(count, price)}
                        disabled={tierLoading || checkoutLoading}
                      >
                        {tierLoading
                          ? <span className="tier-spinner"><span className="spinner" /></span>
                          : <>
                              <span className="tier-count">{count} Leads</span>
                              <span className="tier-price">${price}</span>
                            </>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {confirming && pendingTier && (
                <div className="availability-notice">
                  <p className="availability-warning">⚠️ Only {pendingTier.available} leads found in {city}, {state} for {niche}.</p>
                  <p className="availability-msg">
                    You selected {pendingTier.requestedCount} leads but only {pendingTier.available} are available.
                    You will be charged <strong>${pendingTier.price}</strong> and receive all {pendingTier.available} leads.
                  </p>
                  <p className="availability-refund">
                    All sales are final. No refunds will be issued once payment is processed and your CSV is delivered.
                  </p>
                  <p className="availability-confirm-label">Do you want to continue?</p>
                  <div className="availability-actions">
                    <button
                      className="btn btn--ghost"
                      onClick={() => { setConfirming(false); setPendingTier(null); }}
                      disabled={checkoutLoading}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn--primary"
                      onClick={() => handleCheckout(pendingTier.requestedCount)}
                      disabled={checkoutLoading}
                    >
                      {checkoutLoading
                        ? <span className="btn-inner"><span className="spinner spinner--white" />Redirecting…</span>
                        : `Yes, Continue — $${pendingTier.price}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>


      {/* ── FOOTER ─────────────────────────────────────────────── */}
      <footer className="footer">
        <div className="footer-inner">
          <p className="footer-copy">© 2026 LocalLeadPull</p>
          <div className="footer-links">
            <a href="/terms" className="footer-link">Terms of Service</a>
            <a href="/privacy" className="footer-link">Privacy Policy</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
