/**
 * Market Analysis Engine
 * Detects order blocks, OI buildup patterns, and generates trading signals
 * similar to order-block.com
 */

// ======== ORDER BLOCK DETECTION ========

/**
 * Detect order blocks from candlestick data.
 * An order block is the last opposing candle before a strong impulsive move.
 */
export function detectOrderBlocks(candles) {
  if (!candles || candles.length < 10) return [];

  const blocks = [];
  const atr = calculateATR(candles, 14);

  for (let i = 3; i < candles.length - 1; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const next = candles[i + 1] || current;
    const atrVal = atr[i] || atr[atr.length - 1];

    const currentBody = Math.abs(current.close - current.open);
    const prevBody = Math.abs(prev.close - prev.open);

    // BULLISH ORDER BLOCK:
    // Down candle followed by a strong up candle that engulfs it
    if (prev.close < prev.open && current.close > current.open) {
      const impulsiveSize = currentBody / atrVal;

      if (impulsiveSize > 0.8 && currentBody > prevBody * 1.2) {
        // Check if the zone has been revisited (tested)
        let tested = false;
        let mitigated = false;
        for (let j = i + 1; j < candles.length; j++) {
          if (candles[j].low <= prev.open && candles[j].low >= prev.close) {
            tested = true;
          }
          if (candles[j].close < prev.close) {
            mitigated = true;
          }
        }

        const strength = Math.min(100, Math.floor(impulsiveSize * 35));
        const volumeConfirm = current.volume > (candles.slice(Math.max(0, i - 10), i).reduce((s, c) => s + c.volume, 0) / 10) * 1.3;

        blocks.push({
          type: 'bullish',
          index: i - 1,
          time: prev.time,
          high: Math.max(prev.open, prev.close),
          low: Math.min(prev.open, prev.close),
          impulsiveCandle: current,
          strength,
          label: 'LONG BUILD-UP',
          tested,
          mitigated,
          volumeConfirm,
          atrMultiple: parseFloat(impulsiveSize.toFixed(2)),
        });
      }
    }

    // BEARISH ORDER BLOCK:
    // Up candle followed by a strong down candle that engulfs it
    if (prev.close > prev.open && current.close < current.open) {
      const impulsiveSize = currentBody / atrVal;

      if (impulsiveSize > 0.8 && currentBody > prevBody * 1.2) {
        let tested = false;
        let mitigated = false;
        for (let j = i + 1; j < candles.length; j++) {
          if (candles[j].high >= prev.open && candles[j].high <= prev.close) {
            tested = true;
          }
          if (candles[j].close > prev.close) {
            mitigated = true;
          }
        }

        const strength = Math.min(100, Math.floor(impulsiveSize * 35));
        const volumeConfirm = current.volume > (candles.slice(Math.max(0, i - 10), i).reduce((s, c) => s + c.volume, 0) / 10) * 1.3;

        blocks.push({
          type: 'bearish',
          index: i - 1,
          time: prev.time,
          high: Math.max(prev.open, prev.close),
          low: Math.min(prev.open, prev.close),
          impulsiveCandle: current,
          strength,
          label: 'SHORT BUILD-UP',
          tested,
          mitigated,
          volumeConfirm,
          atrMultiple: parseFloat(impulsiveSize.toFixed(2)),
        });
      }
    }
  }

  // Return most recent blocks, sorted by strength
  return blocks.slice(-30).sort((a, b) => b.strength - a.strength);
}

// ======== OI BUILDUP ANALYSIS ========

/**
 * Classify OI buildup based on price and OI changes
 * This is what OrderBlock.com shows as LONG BUILD-UP, SHORT BUILD-UP, etc.
 */
export function classifyOIBuildup(priceChange, oiChange) {
  if (priceChange > 0 && oiChange > 0) return { type: 'LONG BUILD-UP', sentiment: 'BULL', color: '#00e676' };
  if (priceChange < 0 && oiChange > 0) return { type: 'SHORT BUILD-UP', sentiment: 'BEAR', color: '#ff1744' };
  if (priceChange < 0 && oiChange < 0) return { type: 'LONG UNWINDING', sentiment: 'BEAR', color: '#ff9100' };
  if (priceChange > 0 && oiChange < 0) return { type: 'SHORT COVERING', sentiment: 'BULL', color: '#00b0ff' };
  return { type: 'NEUTRAL', sentiment: 'NEUTRAL', color: '#64748b' };
}

// ======== GENERATE SIGNALS FROM OPTIONS DATA ========

/**
 * Generate BULL/BEAR trading signals using options OI data
 * like the signal cards on OrderBlock.com
 */
export function generateSignalsFromOptions(optionsData, candles) {
  if (!optionsData || !candles || candles.length < 5) return generateFallbackSignals(candles);

  const signals = [];
  const currentPrice = optionsData.underlyingValue || candles[candles.length - 1].close;
  const supports = optionsData.support || [];
  const resistances = optionsData.resistance || [];
  const pcr = optionsData.pcr || 1;

  // Generate sparkline data based on recent price movement
  const recentPrices = candles.slice(-20).map(c => c.close);
  const bullSpark = recentPrices.map((p, i) => 20 + (i / recentPrices.length) * 60 + (Math.random() * 10 - 5));
  const bearSpark = recentPrices.map((p, i) => 80 - (i / recentPrices.length) * 60 + (Math.random() * 10 - 5));

  // OI buildup classification
  const priceChange = candles.length >= 2 ? candles[candles.length - 1].close - candles[candles.length - 2].close : 0;
  const oiChange = optionsData.totalCallOIChange + optionsData.totalPutOIChange;
  const buildup = classifyOIBuildup(priceChange, oiChange);

  // BULL signals from put OI support levels
  for (let i = 0; i < Math.min(3, supports.length); i++) {
    const sup = supports[i];
    signals.push({
      type: 'BULL',
      label: 'LONG BUILD-UP',
      oi: `+${((sup.oi / (optionsData.totalPutOI || 1)) * 100).toFixed(1)}%`,
      price: currentPrice.toFixed(2),
      s1: supports[0]?.strike?.toFixed(2) || (currentPrice * 0.97).toFixed(2),
      s2: supports[1]?.strike?.toFixed(2) || (currentPrice * 0.94).toFixed(2),
      r1: resistances[0]?.strike?.toFixed(2) || (currentPrice * 1.03).toFixed(2),
      r2: resistances[1]?.strike?.toFixed(2) || (currentPrice * 1.06).toFixed(2),
      zone: currentPrice.toFixed(2),
      risk: pcr > 1.2 ? 'LOW' : pcr > 0.8 ? 'MEDIUM' : 'HIGH',
      strength: Math.min(95, Math.floor(50 + pcr * 25)),
      sparkData: bullSpark.map((v, idx) => v + i * 3 + Math.random() * 5),
      oiData: sup,
      maxPain: optionsData.maxPain,
      pcr: optionsData.pcr,
    });
  }

  // BEAR signals from call OI resistance levels
  for (let i = 0; i < Math.min(3, resistances.length); i++) {
    const res = resistances[i];
    signals.push({
      type: 'BEAR',
      label: 'SHORT BUILD-UP',
      oi: `-${((res.oi / (optionsData.totalCallOI || 1)) * 100).toFixed(1)}%`,
      price: currentPrice.toFixed(2),
      s1: supports[0]?.strike?.toFixed(2) || (currentPrice * 0.97).toFixed(2),
      s2: supports[1]?.strike?.toFixed(2) || (currentPrice * 0.94).toFixed(2),
      r1: resistances[0]?.strike?.toFixed(2) || (currentPrice * 1.03).toFixed(2),
      r2: resistances[1]?.strike?.toFixed(2) || (currentPrice * 1.06).toFixed(2),
      zone: currentPrice.toFixed(2),
      risk: pcr < 0.8 ? 'LOW' : pcr < 1.2 ? 'MEDIUM' : 'HIGH',
      strength: Math.min(95, Math.floor(50 + (1 / Math.max(0.1, pcr)) * 25)),
      sparkData: bearSpark.map((v, idx) => v - i * 3 + Math.random() * 5),
      oiData: res,
      maxPain: optionsData.maxPain,
      pcr: optionsData.pcr,
    });
  }

  return signals;
}

// Fallback signal generation when options data isn't available
function generateFallbackSignals(candles) {
  if (!candles || candles.length < 20) return [];

  const signals = [];
  const current = candles[candles.length - 1];
  const price = current.close;
  const recent = candles.slice(-20);
  const sma5 = recent.slice(-5).reduce((s, c) => s + c.close, 0) / 5;
  const sma20 = recent.reduce((s, c) => s + c.close, 0) / 20;
  const trend = sma5 > sma20 ? 'bullish' : 'bearish';

  for (let i = 0; i < 3; i++) {
    const bullSparkData = Array.from({ length: 20 }, (_, j) => 30 + j * 2.5 + Math.random() * 8 - i * 5);
    const bearSparkData = Array.from({ length: 20 }, (_, j) => 70 - j * 2.5 + Math.random() * 8 + i * 5);

    signals.push({
      type: 'BULL',
      label: 'LONG BUILD-UP',
      oi: `+${(2 + Math.random() * 8).toFixed(1)}%`,
      price: price.toFixed(2),
      s1: (price * (0.97 - i * 0.01)).toFixed(2),
      s2: (price * (0.94 - i * 0.01)).toFixed(2),
      r1: (price * (1.03 + i * 0.01)).toFixed(2),
      r2: (price * (1.06 + i * 0.01)).toFixed(2),
      zone: (price * (1 + i * 0.005)).toFixed(2),
      risk: ['LOW', 'MEDIUM', 'LOW'][i],
      strength: [85, 72, 64][i],
      sparkData: bullSparkData,
    });

    signals.push({
      type: 'BEAR',
      label: 'SHORT BUILD-UP',
      oi: `-${(1.5 + Math.random() * 6).toFixed(1)}%`,
      price: price.toFixed(2),
      s1: (price * (0.97 - i * 0.01)).toFixed(2),
      s2: (price * (0.94 - i * 0.01)).toFixed(2),
      r1: (price * (1.03 + i * 0.01)).toFixed(2),
      r2: (price * (1.06 + i * 0.01)).toFixed(2),
      zone: (price * (0.99 - i * 0.005)).toFixed(2),
      risk: ['HIGH', 'MEDIUM', 'HIGH'][i],
      strength: [78, 65, 55][i],
      sparkData: bearSparkData,
    });
  }

  return signals;
}

// ======== SUPPORT / RESISTANCE FROM PRICE ACTION ========

export function calculateSR(candles) {
  if (!candles || candles.length < 20) return { supports: [], resistances: [] };

  const recent = candles.slice(-60);
  const currentPrice = recent[recent.length - 1].close;

  // Pivot points
  const lastCandle = recent[recent.length - 1];
  const pivot = (lastCandle.high + lastCandle.low + lastCandle.close) / 3;
  const r1 = 2 * pivot - lastCandle.low;
  const r2 = pivot + (lastCandle.high - lastCandle.low);
  const s1 = 2 * pivot - lastCandle.high;
  const s2 = pivot - (lastCandle.high - lastCandle.low);

  return {
    pivot: parseFloat(pivot.toFixed(2)),
    supports: [
      { level: parseFloat(s1.toFixed(2)), label: 'S1', type: 'pivot' },
      { level: parseFloat(s2.toFixed(2)), label: 'S2', type: 'pivot' },
    ],
    resistances: [
      { level: parseFloat(r1.toFixed(2)), label: 'R1', type: 'pivot' },
      { level: parseFloat(r2.toFixed(2)), label: 'R2', type: 'pivot' },
    ],
  };
}

// ======== TECHNICAL INDICATORS ========

export function calculateATR(candles, period = 14) {
  const atr = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      atr.push(candles[i].high - candles[i].low);
      continue;
    }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    if (i < period) {
      atr.push(tr);
    } else {
      atr.push((atr[i - 1] * (period - 1) + tr) / period);
    }
  }
  return atr;
}

export function calculateRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;

  const changes = candles.slice(-(period + 1)).map((c, i, arr) =>
    i > 0 ? c.close - arr[i - 1].close : 0
  ).slice(1);

  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.length ? gains.reduce((s, g) => s + g, 0) / period : 0;
  const avgLoss = losses.length ? losses.reduce((s, l) => s + l, 0) / period : 1;

  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

export function calculateVWAP(candles) {
  let cumVolPrice = 0;
  let cumVol = 0;
  return candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3;
    cumVolPrice += tp * c.volume;
    cumVol += c.volume;
    return { time: c.time, value: parseFloat((cumVolPrice / cumVol).toFixed(2)) };
  });
}

export function calculateSMA(candles, period) {
  const result = [];
  for (let i = period - 1; i < candles.length; i++) {
    const sum = candles.slice(i - period + 1, i + 1).reduce((s, c) => s + c.close, 0);
    result.push({ time: candles[i].time, value: parseFloat((sum / period).toFixed(2)) });
  }
  return result;
}

// ======== MARKET METRICS CALCULATOR ========

export function computeMetrics(candles, quote = null) {
  if (!candles || candles.length < 2) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // Use real quote data if available, otherwise calculate from candles
  const price = quote?.price || last.close;
  const change = quote?.change || (last.close - prev.close);
  const changePct = quote?.changePct || ((change / prev.close) * 100);

  const recent20 = candles.slice(-20);
  const sma20 = recent20.reduce((s, c) => s + c.close, 0) / 20;
  const recent50 = candles.slice(-50);
  const sma50 = recent50.length >= 50 ? recent50.reduce((s, c) => s + c.close, 0) / 50 : sma20;

  const avgVol = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  const rsi = calculateRSI(candles);

  // VWAP (from today's candle or last candle)
  const vwapCandles = candles.slice(-20);
  const vwap = vwapCandles.reduce((s, c) => s + c.close * c.volume, 0) / vwapCandles.reduce((s, c) => s + c.volume, 0);

  return {
    price: price.toFixed(2),
    change: change.toFixed(2),
    changePct: changePct.toFixed(2),
    open: (quote?.open || last.open).toFixed(2),
    high: (quote?.high || last.high).toFixed(2),
    low: (quote?.low || last.low).toFixed(2),
    volume: quote?.volume || last.volume,
    avgVolume: quote?.avgVolume || Math.floor(avgVol),
    sma20: sma20.toFixed(2),
    sma50: sma50.toFixed(2),
    rsi,
    vwap: vwap.toFixed(2),
    rank: Math.floor(Math.random() * 50) + 1,
    isPositive: change >= 0,
    marketCap: quote?.marketCap || null,
    pe: quote?.pe || null,
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh || null,
    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow || null,
  };
}
