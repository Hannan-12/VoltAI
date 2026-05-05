import os
import json
import numpy as np
import pandas as pd
from datetime import date, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'PZEM_Data_-_Data__2_.csv')


def _load_daily_kwh():
    df = pd.read_csv(DATA_PATH)
    df['Time'] = pd.to_datetime(df['Time'])
    df = df.sort_values('Time')
    df['interval_s'] = df['Time'].diff().dt.total_seconds().fillna(10).clip(1, 60)
    df['kwh'] = df['Power'] * df['interval_s'] / 3_600_000
    daily = df.groupby(df['Time'].dt.date)['kwh'].sum()
    return daily  # pd.Series keyed by date


def _day_of_week_pattern(daily: pd.Series):
    """Return average kWh per weekday (0=Mon … 6=Sun), falling back to global mean."""
    global_mean = float(daily.mean())
    pattern = {}
    for dow in range(7):
        vals = daily[[d for d in daily.index if d.weekday() == dow]]
        pattern[dow] = float(vals.mean()) if len(vals) >= 2 else global_mean
    return pattern, global_mean


def _weighted_recent_mean(daily: pd.Series, n: int = 14):
    """Exponentially-weighted mean of the last n available days."""
    recent = daily.iloc[-n:] if len(daily) >= n else daily
    weights = np.exp(np.linspace(0, 1, len(recent)))
    return float(np.average(recent.values, weights=weights))


def forecast():
    daily = _load_daily_kwh()

    # Filter out near-zero days (data gaps, < 0.05 kWh)
    daily = daily[daily >= 0.05]

    if len(daily) < 3:
        raise ValueError("Not enough data to forecast. Need at least 3 days of readings.")

    dow_pattern, global_mean = _day_of_week_pattern(daily)
    recent_mean = _weighted_recent_mean(daily)

    # Blend: 60% recent weighted mean, 40% day-of-week pattern
    def predict_day(target_date: date) -> float:
        dow_avg = dow_pattern.get(target_date.weekday(), global_mean)
        blended = 0.6 * recent_mean + 0.4 * dow_avg
        return round(max(blended, 0.01), 4)

    today = date.today()

    # ── 24-hour forecast (next day) ──────────────────────────
    next_day = today + timedelta(days=1)
    forecast_24h = predict_day(next_day)

    # Hourly breakdown: distribute daily kWh across 24h using a usage profile
    # Peak usage: morning (7-9), evening (18-22); low overnight
    hourly_weights = [
        0.5, 0.3, 0.2, 0.2, 0.2, 0.4,   # 0–5
        0.7, 1.5, 1.8, 1.2, 1.0, 1.0,   # 6–11
        1.1, 1.0, 0.9, 0.8, 0.9, 1.4,   # 12–17
        1.8, 2.0, 1.9, 1.5, 1.0, 0.7,   # 18–23
    ]
    total_w = sum(hourly_weights)
    hourly_kwh = [round(forecast_24h * w / total_w, 4) for w in hourly_weights]

    # ── 7-day forecast ───────────────────────────────────────
    forecast_7d = []
    for i in range(1, 8):
        d = today + timedelta(days=i)
        forecast_7d.append({
            'date': d.isoformat(),
            'day_label': d.strftime('%a %d %b'),
            'kwh': predict_day(d),
        })

    # ── 30-day forecast ──────────────────────────────────────
    forecast_30d = []
    for i in range(1, 31):
        d = today + timedelta(days=i)
        forecast_30d.append({
            'date': d.isoformat(),
            'day_label': d.strftime('%d %b'),
            'kwh': predict_day(d),
        })

    # ── Historical summary (last 14 available days) ──────────
    history = daily.iloc[-14:] if len(daily) >= 14 else daily
    history_list = [
        {'date': str(d), 'day_label': d.strftime('%d %b'), 'kwh': round(float(v), 4)}
        for d, v in history.items()
    ]

    total_7d  = round(sum(d['kwh'] for d in forecast_7d), 3)
    total_30d = round(sum(d['kwh'] for d in forecast_30d), 3)

    return {
        'forecast_24h': {
            'date': next_day.isoformat(),
            'total_kwh': forecast_24h,
            'hourly': [{'hour': h, 'kwh': kwh} for h, kwh in enumerate(hourly_kwh)],
        },
        'forecast_7d': {
            'days': forecast_7d,
            'total_kwh': total_7d,
            'avg_kwh_per_day': round(total_7d / 7, 3),
        },
        'forecast_30d': {
            'days': forecast_30d,
            'total_kwh': total_30d,
            'avg_kwh_per_day': round(total_30d / 30, 3),
        },
        'history': history_list,
        'model_info': {
            'method': 'Weighted blend (60% exponential recent mean + 40% day-of-week average)',
            'training_days': len(daily),
            'recent_mean_kwh': round(recent_mean, 4),
            'global_mean_kwh': round(global_mean, 4),
        },
    }
