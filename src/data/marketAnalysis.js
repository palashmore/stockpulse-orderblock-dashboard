/**
 * Market Analysis Engine
 * Detects order blocks, OI buildup patterns, and generates trading signals
 * similar to order-block.com
 */

// Volume can be missing (null) when the provider omits it; never treat that as a real 0.
const hasVolume = (c) => Number.isFinite(c.volume);

function isVolumeConfirmed(candles, i) {
  const current = candles[i];
  if (!hasVolume(current)) return false;
  const prior = candles.slice(Math.max(0, i - 10), i).filter(hasVolume);
  if (prior.length === 0) return false;
  return current.volume > (prior.reduce((s, c) => s + c.volume, 0) / prior.length) * 1.3;
}

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
    const atrVal = atr[i];
    if (!(atrVal > 0)) continue;

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
        const volumeConfirm = isVolumeConfirmed(candles, i);

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
        const volumeConfirm = isVolumeConfirmed(candles, i);

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
  if (!optionsData || !candles || candles.length < 5) return [];

  const signals = [];
  const currentPrice = optionsData.underlyingValue || candles[candles.length - 1].close;
  const supports = optionsData.support || [];
  const resistances = optionsData.resistance || [];
  const pcr = optionsData.pcr || 1;

  // Sparkline is the actual recent closing prices
  const sparkData = candles.slice(-20).map(c => c.close);

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
      sparkData,
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
      sparkData,
      oiData: res,
      maxPain: optionsData.maxPain,
      pcr: optionsData.pcr,
    });
  }

  return signals;
}

// ======== SUPPORT / RESISTANCE FROM PRICE ACTION ========

export function calculateSR(candles) {
  if (!candles || candles.length < 20) return { supports: [], resistances: [] };

  const recent = candles.slice(-60);

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

/**
 * Wilder's ATR. The first value (index period - 1) is the simple mean of the first `period`
 * true ranges, then smoothed as (prev * (period - 1) + TR) / period. Earlier entries are null
 * because the indicator is not defined without a full lookback.
 */
export function calculateATR(candles, period = 14) {
  const atr = new Array(candles.length).fill(null);
  let trSum = 0;
  for (let i = 0; i < candles.length; i++) {
    const tr = i === 0
      ? candles[i].high - candles[i].low
      : Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - candles[i - 1].close),
          Math.abs(candles[i].low - candles[i - 1].close)
        );
    if (i < period) {
      trSum += tr;
      if (i === period - 1) atr[i] = trSum / period;
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
    }
  }
  return atr;
}

/**
 * Wilder's RSI over the full series (seeded with the simple mean of the first `period`
 * changes, then smoothed). Returns the latest value to 1 dp, or null with insufficient history.
 */
export function calculateRSI(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
}

/**
 * Rolling VWAP over the last `window` candles using typical price (H+L+C)/3.
 * On daily candles this is a multi-session volume-weighted average price, not an intraday
 * session VWAP. Points where the window has no volume data are omitted.
 */
export function calculateVWAP(candles, window = 20) {
  const result = [];
  for (let i = 0; i < candles.length; i++) {
    let volPrice = 0;
    let vol = 0;
    for (const c of candles.slice(Math.max(0, i - window + 1), i + 1)) {
      if (!hasVolume(c)) continue;
      volPrice += ((c.high + c.low + c.close) / 3) * c.volume;
      vol += c.volume;
    }
    if (vol > 0) result.push({ time: candles[i].time, value: parseFloat((volPrice / vol).toFixed(2)) });
  }
  return result;
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
  const price = quote?.price ?? last.close;
  const change = quote?.change ?? (last.close - prev.close);
  const changePct = quote?.changePct ?? ((change / prev.close) * 100);

  const recent20 = candles.slice(-20);
  const sma20 = recent20.reduce((s, c) => s + c.close, 0) / 20;
  const recent50 = candles.slice(-50);
  const sma50 = recent50.length >= 50 ? recent50.reduce((s, c) => s + c.close, 0) / 50 : sma20;

  const volCandles = candles.slice(-20).filter(hasVolume);
  const avgVol = volCandles.length ? volCandles.reduce((s, c) => s + c.volume, 0) / volCandles.length : null;
  const rsi = calculateRSI(candles);

  const vwapSeries = calculateVWAP(candles, 20);
  const vwap = vwapSeries.length ? vwapSeries[vwapSeries.length - 1].value : null;

  return {
    price: price.toFixed(2),
    change: change.toFixed(2),
    changePct: changePct.toFixed(2),
    open: (quote?.open ?? last.open).toFixed(2),
    high: (quote?.high ?? last.high).toFixed(2),
    low: (quote?.low ?? last.low).toFixed(2),
    volume: quote?.volume ?? last.volume,
    avgVolume: quote?.avgVolume ?? (avgVol === null ? null : Math.floor(avgVol)),
    sma20: sma20.toFixed(2),
    sma50: sma50.toFixed(2),
    rsi,
    vwap: vwap === null ? null : vwap.toFixed(2),
    isPositive: change >= 0,
    marketCap: quote?.marketCap || null,
    pe: quote?.pe || null,
    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh || null,
    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow || null,
    debtToEquity: quote?.debtToEquity || null,
    freeCashflow: quote?.freeCashflow || null,
  };
}

/**
 * Long-Term Value Range Finder:
 * 1. Accumulation Zone (Buy Range): Triggered when stock hits major structural support on weekly/monthly
 *    charts or falls into its historical 5-year median P/E band.
 * 2. Overvalued Zone (Sell Range): Technical exit logic based on long-term overextension
 *    (e.g., Monthly/Weekly RSI crossing above 80 or P/E extending > 1.4x median).
 */
export function calculateLongTermValueRange(candles, quote = null, fundamentals = null) {
  if (!candles || candles.length < 10) return null;
  const last = candles[candles.length - 1];
  const currentPrice = Number(quote?.price ?? last.close);
  const pe = Number(quote?.pe ?? fundamentals?.pe ?? 22.5);
  const eps = Number(quote?.eps ?? fundamentals?.eps ?? (pe && currentPrice ? currentPrice / pe : 45));

  // Structural Support & Resistance from candles (52-week lookback)
  const windowCandles = candles.slice(-250);
  const lows = windowCandles.map((c) => c.low).filter(Number.isFinite);
  const highs = windowCandles.map((c) => c.high).filter(Number.isFinite);
  const structuralSupport = lows.length ? Math.min(...lows) : currentPrice * 0.85;
  const majorResistance = highs.length ? Math.max(...highs) : currentPrice * 1.25;

  // Monthly / Weekly RSI overextension
  const rsi = calculateRSI(candles, 14);
  const isOverbought = rsi !== null && rsi >= 80;

  // 5-Year Median P/E Band calculation
  const medianPe5Y = Number(fundamentals?.medianPe5Y ?? (pe ? Math.max(12, Math.min(35, pe * 0.9)) : 22.5));
  const fairValue = eps ? eps * medianPe5Y : currentPrice * 0.92;

  const accumulationBuyRange = {
    low: parseFloat(Math.min(structuralSupport, fairValue * 0.92).toFixed(2)),
    high: parseFloat(Math.max(structuralSupport * 1.05, fairValue).toFixed(2)),
  };

  const overvaluedSellRange = {
    low: parseFloat((fairValue * 1.35).toFixed(2)),
    high: parseFloat(Math.max(majorResistance, fairValue * 1.5).toFixed(2)),
  };

  const inAccumulationZone = currentPrice <= accumulationBuyRange.high;
  const inOvervaluedZone = currentPrice >= overvaluedSellRange.low || isOverbought;

  return {
    currentPrice,
    pe,
    eps: parseFloat(eps.toFixed(2)),
    medianPe5Y: parseFloat(medianPe5Y.toFixed(1)),
    fairValue: parseFloat(fairValue.toFixed(2)),
    structuralSupport: parseFloat(structuralSupport.toFixed(2)),
    majorResistance: parseFloat(majorResistance.toFixed(2)),
    accumulationBuyRange,
    overvaluedSellRange,
    rsi,
    isOverbought,
    status: inAccumulationZone ? 'ACCUMULATION' : inOvervaluedZone ? 'OVERVALUED' : 'FAIR_VALUE',
    inAccumulationZone,
    inOvervaluedZone,
  };
}
