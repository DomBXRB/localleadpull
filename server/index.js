require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Stripe = require('stripe');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// In-memory cache: searchKey → result object
// TTL: 2 hours
const cache = new Map();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > CACHE_TTL_MS) cache.delete(key);
  }
}
setInterval(pruneCache, 10 * 60 * 1000);

const allowedOrigins = [
  'https://localleadpull.com',
  'https://www.localleadpull.com',
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
}));
app.use(express.json());

// ─── Search ─────────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { niche, city, state } = req.query;

  if (!niche || !city || !state) {
    return res.status(400).json({ error: 'niche, city, and state are required.' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Google Places API key not configured.' });
  }

  try {
    const textQuery = `${niche} in ${city}, ${state}`;

    const response = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      {
        textQuery,
        maxResultCount: 20,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.nationalPhoneNumber',
            'places.internationalPhoneNumber',
            'places.websiteUri',
            'places.rating',
            'places.userRatingCount',
            'places.businessStatus',
          ].join(','),
        },
      }
    );

    const places = response.data.places || [];

    const results = places
      .filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY')
      .map(p => ({
        placeId: p.id,
        name: p.displayName?.text || '',
        address: p.formattedAddress || '',
        phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
        website: p.websiteUri || '',
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? null,
      }));

    if (results.length === 0) {
      return res.json({ preview: [], searchKey: null, total: 0 });
    }

    const searchKey = randomUUID();
    cache.set(searchKey, {
      results,
      niche,
      city,
      state,
      createdAt: Date.now(),
    });

    res.json({
      preview: results.slice(0, 3),
      searchKey,
      total: results.length,
    });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('Google Places error:', msg);
    res.status(502).json({ error: `Google Places API error: ${msg}` });
  }
});

// ─── Stripe Checkout ─────────────────────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  const { searchKey, niche, city, state } = req.body;

  if (!searchKey || !cache.has(searchKey)) {
    return res.status(400).json({ error: 'Search results expired. Please search again.' });
  }

  const { results } = cache.get(searchKey);

  if (results.length <= 3) {
    return res.status(400).json({ error: 'No additional leads to unlock.' });
  }

  const amount = Math.max(500, Math.round(results.length * 40));
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: `LocalLeadPull — ${niche} in ${city}, ${state} (${results.length} leads)`,
              description: `Full CSV of local ${niche} businesses in ${city}, ${state}`,
            },
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: { searchKey },
      success_url: `${clientUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(502).json({ error: `Stripe error: ${err.message}` });
  }
});

// ─── Download CSV (post-payment) ─────────────────────────────────────────────
app.get('/api/download', async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'session_id is required.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed.' });
    }

    const searchKey = session.metadata?.searchKey;
    if (!searchKey || !cache.has(searchKey)) {
      return res.status(410).json({
        error: 'Results have expired. Please search again and contact support for a refund.',
      });
    }

    const { results, niche, city, state } = cache.get(searchKey);
    sendCsv(res, results, niche, city, state);
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin Download (bypass Stripe) ─────────────────────────────────────────
app.get('/api/admin-download', (req, res) => {
  const { search_key, admin } = req.query;

  if (admin !== 'localleadpull2026') {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  if (!search_key || !cache.has(search_key)) {
    return res.status(400).json({ error: 'Search results not found or expired.' });
  }

  const { results, niche, city, state } = cache.get(search_key);
  sendCsv(res, results, niche, city, state);
});

// ─── CSV helper ──────────────────────────────────────────────────────────────
function sendCsv(res, results, niche, city, state) {
  const csvRows = [
    ['Business Name', 'Phone', 'Website', 'Google Rating', 'Reviews', 'Address'],
    ...results.map(r => [
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${(r.phone || '').replace(/"/g, '""')}"`,
      `"${(r.website || '').replace(/"/g, '""')}"`,
      r.rating != null ? r.rating : '',
      r.reviewCount != null ? r.reviewCount : '',
      `"${(r.address || '').replace(/"/g, '""')}"`,
    ]),
  ];

  const csv = csvRows.map(row => row.join(',')).join('\r\n');
  const filename = `${niche}-${city}-${state}-leads.csv`
    .toLowerCase()
    .replace(/\s+/g, '-');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

app.listen(PORT, () => {
  console.log(`LocalLeadPull server running on http://localhost:${PORT}`);
});
