chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchStock') {
    fetchStockData(request.ticker)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (request.action === 'fetchWeather') {
    fetchWeather(request.city)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function fetchStockData(ticker) {
  // Use the public v8 chart API (never returns 401)
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d&includePrePost=false`,
  ];

  let lastError = '';

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!resp.ok) { lastError = `HTTP ${resp.status}`; continue; }

      const json = await resp.json();
      if (!json.chart?.result?.length) {
        lastError = 'No data';
        continue;
      }

      const result = json.chart.result[0];
      const meta = result.meta;
      const quotes = result.indicators.quote[0];
      const timestamps = result.timestamp || [];
      const closes = quotes.close || [];
      const highs = quotes.high || [];

      const currentPrice = meta.regularMarketPrice;

      // Strip null entries from the history
      const validCloses = [];
      for (let i = 0; i < closes.length; i++) {
        if (closes[i] != null) validCloses.push(closes[i]);
      }

      // ==========================================
      // Reliable daily-change algorithm
      // ==========================================
      let referenceClose = currentPrice;

      if (validCloses.length >= 2) {
        // On weekends or before the market opens, Yahoo duplicates
        // or freezes the closing candle. This loop walks back past those "frozen" days
        // until it finds the last session where the price actually changed.
        let idx = validCloses.length - 1;
        while (idx > 0 && validCloses[idx] === validCloses[idx - 1]) {
          idx--;
        }

        // idx is now the last real active day; the reference close is the day right before it.
        if (idx > 0) {
          referenceClose = validCloses[idx - 1];
        } else {
          referenceClose = validCloses[0];
        }
      }

      let changeAbs = 0;
      let changePct = 0;
      if (referenceClose > 0) {
        changeAbs = currentPrice - referenceClose;
        changePct = (changeAbs / referenceClose) * 100;
      }

      // ==========================================
      // Highs and sparkline data
      // ==========================================
      const nowTs = Date.now() / 1000;
      let max30 = -Infinity, max365 = -Infinity;

      for (let i = 0; i < timestamps.length; i++) {
        const h = highs[i];
        if (h == null) continue;
        if (timestamps[i] >= nowTs - 365 * 86400 && h > max365) max365 = h;
        if (timestamps[i] >= nowTs - 30 * 86400 && h > max30) max30 = h;
      }

      const sparkData = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] >= nowTs - 90 * 86400 && closes[i] != null)
          sparkData.push(closes[i]);
      }

      return {
        ticker: meta.symbol || ticker,
        name: meta.shortName || meta.longName || ticker,
        price: currentPrice,
        changeAbs,
        changePct,
        currency: meta.currency || 'USD',
        max30: max30 === -Infinity ? null : max30,
        max365: max365 === -Infinity ? null : max365,
        sparkData
      };
    } catch (e) {
      lastError = e.message;
    }
  }

  throw new Error(lastError || 'Failed to fetch');
}

// ========= WEATHER =========
async function fetchWeather(city) {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const geoResp = await fetch(geoUrl);
  const geoJson = await geoResp.json();

  if (!geoJson.results || !geoJson.results.length) throw new Error('City not found');

  const loc = geoJson.results[0];
  const lat = loc.latitude;
  const lon = loc.longitude;
  const cityName = loc.name;
  const country = loc.country_code || '';

  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature&timezone=auto`;
  const wxResp = await fetch(wxUrl);
  const wxJson = await wxResp.json();

  if (!wxJson.current) throw new Error('No weather data');

  const c = wxJson.current;
  return {
    city: cityName,
    country: country,
    temp: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    windSpeed: Math.round(c.wind_speed_10m),
    weatherCode: c.weather_code,
    description: weatherCodeToText(c.weather_code),
    icon: weatherCodeToEmoji(c.weather_code)
  };
}

function weatherCodeToText(code) {
  const map = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle',
    55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Heavy freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Light snow showers', 86: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail'
  };
  return map[code] || 'Unknown';
}

function weatherCodeToEmoji(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}