// Nifty 50 constituents per NSE's official list (niftyindices.com, ind_nifty50list.csv) as of 2026-10-12.
// Sector labels are the app's own grouping. Re-check against NSE after each semi-annual index review.
// The same file's generators below produce simulated candles for ?demo=1 only.
export const NIFTY_STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking' },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'FMCG' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking' },
  { symbol: 'ITC', name: 'ITC Limited', sector: 'FMCG' },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infrastructure' },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Financial Services' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Automobile' },
  { symbol: 'TITAN', name: 'Titan Company', sector: 'Consumer Goods' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma' },
  { symbol: 'HCLTECH', name: 'HCL Technologies', sector: 'IT' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', sector: 'Conglomerate' },
  { symbol: 'TATASTEEL', name: 'Tata Steel', sector: 'Metals' },
  { symbol: 'NTPC', name: 'NTPC Limited', sector: 'Power' },
  { symbol: 'POWERGRID', name: 'Power Grid Corp', sector: 'Power' },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corp', sector: 'Energy' },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', sector: 'Metals' },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Mining' },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT' },
  { symbol: 'DRREDDY', name: "Dr Reddy's Labs", sector: 'Pharma' },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', sector: 'Consumer Goods' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', sector: 'Cement' },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'Financial Services' },
  { symbol: 'NESTLEIND', name: 'Nestle India', sector: 'FMCG' },
  { symbol: 'CIPLA', name: 'Cipla', sector: 'Pharma' },
  { symbol: 'TATACONSUM', name: 'Tata Consumer Products', sector: 'FMCG' },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals', sector: 'Healthcare' },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', sector: 'Automobile' },
  { symbol: 'HINDALCO', name: 'Hindalco Industries', sector: 'Metals' },
  { symbol: 'SBILIFE', name: 'SBI Life Insurance', sector: 'Financial Services' },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', sector: 'Automobile' },
  { symbol: 'GRASIM', name: 'Grasim Industries', sector: 'Cement' },
  { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance', sector: 'Financial Services' },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance', sector: 'Financial Services' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', sector: 'Automobile' },
  { symbol: 'TRENT', name: 'Trent', sector: 'Consumer Goods' },
  { symbol: 'ADANIPORTS', name: 'Adani Ports and Special Economic Zone', sector: 'Infrastructure' },
  { symbol: 'BSE', name: 'BSE', sector: 'Financial Services' },
  { symbol: 'BEL', name: 'Bharat Electronics', sector: 'Capital Goods' },
  { symbol: 'ETERNAL', name: 'Eternal', sector: 'Consumer Services' },
  { symbol: 'INDIGO', name: 'InterGlobe Aviation', sector: 'Services' },
  { symbol: 'JIOFIN', name: 'Jio Financial Services', sector: 'Financial Services' },
  { symbol: 'MAXHEALTH', name: 'Max Healthcare Institute', sector: 'Healthcare' },
  { symbol: 'TMPV', name: 'Tata Motors Passenger Vehicles', sector: 'Automobile' },
];

// Seeded random for reproducibility
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateCandlestickData(symbol, days = 200) {
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = seededRandom(seed);
  
  const basePrices = {
    'RELIANCE': 2850, 'TCS': 3950, 'HDFCBANK': 1720, 'INFY': 1580,
    'ICICIBANK': 1250, 'HINDUNILVR': 2480, 'SBIN': 820, 'BHARTIARTL': 1650,
    'KOTAKBANK': 1780, 'ITC': 465, 'LT': 3520, 'AXISBANK': 1180,
    'BAJFINANCE': 6800, 'MARUTI': 12500, 'TITAN': 3250, 'SUNPHARMA': 1720,
    'TATAMOTORS': 950, 'WIPRO': 520, 'HCLTECH': 1680, 'ADANIENT': 2900,
    'TATASTEEL': 155, 'NTPC': 380, 'POWERGRID': 320, 'ONGC': 275,
    'JSWSTEEL': 890, 'COALINDIA': 480, 'TECHM': 1620, 'DRREDDY': 6200,
    'ASIANPAINT': 2850, 'ULTRACEMCO': 11200,
  };
  
  let price = basePrices[symbol] || 1000;
  const data = [];
  const now = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const volatility = price * 0.02;
    const trend = (rng() - 0.48) * volatility;
    
    const open = price;
    const close = price + trend;
    const high = Math.max(open, close) + rng() * volatility * 0.5;
    const low = Math.min(open, close) - rng() * volatility * 0.5;
    const volume = Math.floor(500000 + rng() * 2000000);
    
    data.push({
      time: date.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    });
    
    price = close;
  }
  
  return data;
}

export function calculateSupportResistance(candleData) {
  if (candleData.length < 20) return { supports: [], resistances: [] };
  
  const recent = candleData.slice(-50);
  const currentPrice = recent[recent.length - 1].close;
  
  const range = currentPrice * 0.05;
  
  return {
    supports: [
      { level: parseFloat((currentPrice - range * 0.4).toFixed(2)), label: 'S1', strength: 75 },
      { level: parseFloat((currentPrice - range * 0.8).toFixed(2)), label: 'S2', strength: 60 },
    ],
    resistances: [
      { level: parseFloat((currentPrice + range * 0.4).toFixed(2)), label: 'R1', strength: 70 },
      { level: parseFloat((currentPrice + range * 0.8).toFixed(2)), label: 'R2', strength: 55 },
    ],
    zone: parseFloat(currentPrice.toFixed(2)),
    risk: currentPrice > recent[recent.length - 10]?.close ? 'LOW' : 'MEDIUM',
  };
}

export function generateSignals(candleData) {
  if (candleData.length < 20) return [];
  
  const recent = candleData.slice(-30);
  const signals = [];
  const currentPrice = recent[recent.length - 1].close;
  
  
  const sr = calculateSupportResistance(candleData);
  
  // Generate 3 bull signals and 3 bear signals
  for (let i = 0; i < 3; i++) {
    signals.push({
      type: 'BULL',
      label: 'LONG BUILD-UP',
      oi: `+${(2 + Math.random() * 8).toFixed(1)}%`,
      price: (currentPrice * (1 + (i * 0.01))).toFixed(2),
      s1: sr.supports[0]?.level || (currentPrice * 0.96).toFixed(2),
      s2: sr.supports[1]?.level || (currentPrice * 0.92).toFixed(2),
      r1: sr.resistances[0]?.level || (currentPrice * 1.04).toFixed(2),
      r2: sr.resistances[1]?.level || (currentPrice * 1.08).toFixed(2),
      zone: (currentPrice * (1 + i * 0.005)).toFixed(2),
      risk: ['LOW', 'MEDIUM', 'LOW'][i],
      strength: [85, 72, 68][i],
      sparkData: generateSparklineData(true),
    });
    
    signals.push({
      type: 'BEAR',
      label: 'SHORT BUILD-UP',
      oi: `-${(1.5 + Math.random() * 6).toFixed(1)}%`,
      price: (currentPrice * (1 - (i + 1) * 0.015)).toFixed(2),
      s1: (currentPrice * (0.95 - i * 0.01)).toFixed(2),
      s2: (currentPrice * (0.92 - i * 0.01)).toFixed(2),
      r1: (currentPrice * (1.02 + i * 0.01)).toFixed(2),
      r2: (currentPrice * (1.05 + i * 0.01)).toFixed(2),
      zone: (currentPrice * (0.99 - i * 0.005)).toFixed(2),
      risk: ['HIGH', 'MEDIUM', 'HIGH'][i],
      strength: [78, 65, 58][i],
      sparkData: generateSparklineData(false),
    });
  }
  
  return signals;
}

function generateSparklineData(bullish) {
  const points = [];
  let val = 50;
  for (let i = 0; i < 20; i++) {
    val += (bullish ? 1 : -1) * (Math.random() * 4 - 1.5);
    val = Math.max(10, Math.min(90, val));
    points.push(val);
  }
  return points;
}

export function getMarketMetrics(candleData) {
  if (candleData.length < 2) return {};
  
  const last = candleData[candleData.length - 1];
  const prev = candleData[candleData.length - 2];
  const change = last.close - prev.close;
  const changePct = (change / prev.close * 100).toFixed(2);
  
  const recent20 = candleData.slice(-20);
  const sma20 = recent20.reduce((s, c) => s + c.close, 0) / 20;
  const recent50 = candleData.slice(-50);
  const sma50 = recent50.length >= 50 ? recent50.reduce((s, c) => s + c.close, 0) / 50 : sma20;
  
  const avgVol = candleData.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  
  // RSI calculation
  const changes = candleData.slice(-15).map((c, i, arr) => i > 0 ? c.close - arr[i-1].close : 0).slice(1);
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.length ? gains.reduce((s, g) => s + g, 0) / 14 : 0;
  const avgLoss = losses.length ? losses.reduce((s, l) => s + l, 0) / 14 : 1;
  const rs = avgGain / avgLoss;
  const rsi = parseFloat((100 - 100 / (1 + rs)).toFixed(1));
  
  // VWAP approximation
  const vwap = recent20.reduce((s, c) => s + (c.close * c.volume), 0) / recent20.reduce((s, c) => s + c.volume, 0);
  
  return {
    price: last.close.toFixed(2),
    change: change.toFixed(2),
    changePct,
    open: last.open.toFixed(2),
    high: last.high.toFixed(2),
    low: last.low.toFixed(2),
    volume: last.volume,
    avgVolume: Math.floor(avgVol),
    sma20: sma20.toFixed(2),
    sma50: sma50.toFixed(2),
    rsi,
    vwap: vwap.toFixed(2),
    rank: Math.floor(Math.random() * 50) + 1,
    isPositive: change >= 0,
  };
}
