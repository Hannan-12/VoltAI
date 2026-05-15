import os
import json
import time
import sqlite3
import datetime
import numpy as np
import joblib
from flask import Flask, jsonify, request, g
from flask_cors import CORS

from data_processor import load_and_process, MODELS_DIR, DATA_PATH
from model_trainer import train, load_model
from evaluator import evaluate
from forecaster import forecast as run_forecast

app = Flask(__name__)

_origins = os.environ.get('ALLOWED_ORIGINS', '*')
CORS(app, origins=_origins)

_APP_START = time.time()

RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')
DB_PATH = os.path.join(os.path.dirname(__file__), 'loads.db')

# ─── Database helpers ─────────────────────────────────────────

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute('''
        CREATE TABLE IF NOT EXISTS loads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            power_watts REAL NOT NULL,
            hours_per_day REAL NOT NULL,
            priority TEXT NOT NULL DEFAULT 'medium',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    db.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    db.commit()
    db.close()

init_db()

# ─── ML helpers ───────────────────────────────────────────────

LABEL_MAP = [
    'Ceiling_Fan', 'Iron', 'LED_Bulbs', 'Microwave_Oven', 'Mixed_Load',
    'Phone_Charger', 'Refrigerator_ACTIVE', 'Refrigerator_IDLE',
    'Standby_Load', 'Unknown_Load', 'WashingMachine_SPIN',
    'WashingMachine_WASH', 'Water_Pump',
]

CLF_FEATURES = ['Voltage', 'Current', 'Power', 'Frequency', 'Power Factor',
                 'Apparent_Power', 'Reactive_Power', 'Hour', 'IsWeekend']

REG_FEATURES = ['Voltage', 'Current', 'Frequency', 'Power Factor',
                 'Apparent_Power', 'Reactive_Power', 'Hour', 'IsWeekend']

# Load all 4 models once at startup
try:
    _CLF    = joblib.load(os.path.join(MODELS_DIR, 'best_appliance_classifier.joblib'))
    _CLF_SC = joblib.load(os.path.join(MODELS_DIR, 'feature_scaler.joblib'))
    _REG    = joblib.load(os.path.join(MODELS_DIR, 'best_power_regressor.joblib'))
    _REG_SC = joblib.load(os.path.join(MODELS_DIR, 'regression_feature_scaler.joblib'))
    _MODELS_READY = True
except Exception as _e:
    _CLF = _CLF_SC = _REG = _REG_SC = None
    _MODELS_READY = False


def _build_features(raw: dict):
    """Compute derived features from a raw PZEM reading dict."""
    voltage = float(raw.get('Voltage') or raw.get('voltage') or 0)
    current = float(raw.get('Current') or raw.get('current') or 0)
    power   = float(raw.get('Power')   or raw.get('power')   or 0)
    freq    = float(raw.get('Frequency') or raw.get('frequency') or 0)
    pf      = float(raw.get('Power Factor') or raw.get('power_factor') or 0)
    apparent = voltage * current
    reactive = float(np.sqrt(max(apparent ** 2 - power ** 2, 0)))

    # Hour / IsWeekend from Time or timestamp field
    hour = 0
    is_weekend = 0
    ts = raw.get('Time') or raw.get('timestamp') or ''
    if ts:
        for fmt in ('%m/%d/%Y %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S'):
            try:
                dt = datetime.datetime.strptime(str(ts), fmt)
                hour = dt.hour
                is_weekend = 1 if dt.weekday() >= 5 else 0
                break
            except Exception:
                pass
    else:
        now = datetime.datetime.now()
        hour = now.hour
        is_weekend = 1 if now.weekday() >= 5 else 0

    clf_row = [voltage, current, power, freq, pf, apparent, reactive, hour, is_weekend]
    reg_row = [voltage, current, freq, pf, apparent, reactive, hour, is_weekend]
    return clf_row, reg_row


def _run_both(raw: dict):
    """Run classifier + regressor on a single raw reading. Returns result dict."""
    t0 = time.time()
    clf_row, reg_row = _build_features(raw)

    X_clf = _CLF_SC.transform([clf_row])
    pred_idx = int(_CLF.predict(X_clf)[0])
    proba    = _CLF.predict_proba(X_clf)[0]
    label      = LABEL_MAP[pred_idx]
    confidence = float(proba[pred_idx])
    top3 = sorted(
        [{'label': LABEL_MAP[i], 'probability': round(float(p), 4)} for i, p in enumerate(proba)],
        key=lambda x: x['probability'], reverse=True
    )[:3]

    X_reg = _REG_SC.transform([reg_row])
    est_power = float(_REG.predict(X_reg)[0])

    ms = round((time.time() - t0) * 1000, 2)
    return {
        'appliance':         label,
        'confidence':        round(confidence * 100, 2),
        'top_3':             top3,
        'estimated_power_w': round(est_power, 2),
        'inference_time_ms': ms,
    }

# ─── Health / Meta ────────────────────────────────────────────

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'model_trained': _MODELS_READY,
        'uptime_s': round(time.time() - _APP_START, 1),
        'version': '2.0.0',
    })


@app.route('/api/appliances', methods=['GET'])
def list_appliances():
    return jsonify({'status': 'success', 'appliances': LABEL_MAP, 'count': len(LABEL_MAP)})

# ─── Train / Evaluate ─────────────────────────────────────────

@app.route('/api/train', methods=['POST'])
def train_model():
    try:
        X_train, X_test, y_train, y_test, le, scaler, feature_cols = load_and_process(DATA_PATH)
        model, cv_results = train(X_train, y_train, len(le.classes_))
        eval_results = evaluate(model, X_test, y_test, le, feature_cols)
        return jsonify({
            'status': 'success',
            'cv_mean': cv_results['cv_mean'],
            'cv_std': cv_results['cv_std'],
            'cv_scores': cv_results['cv_scores'],
            **eval_results,
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/evaluate', methods=['GET'])
def get_evaluation():
    results_path = os.path.join(RESULTS_DIR, 'evaluation_results.json')
    cv_path = os.path.join(RESULTS_DIR, 'cv_results.json')

    if not os.path.exists(results_path):
        return jsonify({'status': 'error', 'message': 'Model not evaluated yet. Call /api/train first.'}), 404

    with open(results_path) as f:
        results = json.load(f)

    if os.path.exists(cv_path):
        with open(cv_path) as f:
            cv = json.load(f)
        results.update(cv)

    return jsonify({'status': 'success', **results})

# ─── Predict ──────────────────────────────────────────────────

def _models_check():
    if not _MODELS_READY:
        return jsonify({'status': 'error', 'message': 'Models not loaded'}), 503
    return None


@app.route('/api/predict', methods=['POST'])
def predict():
    err = _models_check()
    if err: return err

    body = request.get_json(silent=True)
    if not body or 'features' not in body:
        return jsonify({'status': 'error', 'message': f'Provide "features" dict with keys: {CLF_FEATURES}'}), 400

    try:
        raw = body['features']
        if isinstance(raw, dict):
            clf_row, _ = _build_features(raw)
        elif isinstance(raw, list):
            if len(raw) != len(CLF_FEATURES):
                raise ValueError(f'Expected {len(CLF_FEATURES)} values, got {len(raw)}')
            clf_row = [float(v) for v in raw]
        else:
            raise ValueError('features must be a dict or list')

        X = _CLF_SC.transform([clf_row])
        pred_idx = int(_CLF.predict(X)[0])
        proba = _CLF.predict_proba(X)[0]
        label = LABEL_MAP[pred_idx]

        return jsonify({
            'status': 'success',
            'predicted_label': label,
            'confidence': float(proba[pred_idx]),
            'probabilities': {lbl: float(p) for lbl, p in zip(LABEL_MAP, proba)},
        })
    except (KeyError, ValueError) as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/predict/appliance', methods=['POST'])
def predict_appliance():
    """Clean endpoint: accepts raw PZEM fields, returns appliance + confidence + top3."""
    err = _models_check()
    if err: return err

    body = request.get_json(silent=True) or {}
    try:
        result = _run_both(body)
        return jsonify({
            'status': 'success',
            'appliance':         result['appliance'],
            'confidence':        result['confidence'],
            'top_3':             result['top_3'],
            'timestamp':         body.get('timestamp') or datetime.datetime.now().isoformat(),
            'inference_time_ms': result['inference_time_ms'],
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/predict/power', methods=['POST'])
def predict_power():
    """Estimate active power using the regressor."""
    err = _models_check()
    if err: return err

    body = request.get_json(silent=True) or {}
    try:
        t0 = time.time()
        _, reg_row = _build_features(body)
        X = _REG_SC.transform([reg_row])
        est = float(_REG.predict(X)[0])
        return jsonify({
            'status': 'success',
            'estimated_power_w': round(est, 2),
            'inference_time_ms': round((time.time() - t0) * 1000, 2),
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/predict/both', methods=['POST'])
def predict_both():
    """Single call: classifier + regressor. Main endpoint for the live dashboard."""
    err = _models_check()
    if err: return err

    body = request.get_json(silent=True) or {}
    try:
        result = _run_both(body)
        return jsonify({
            'status':            'success',
            'appliance':         result['appliance'],
            'confidence':        result['confidence'],
            'top_3':             result['top_3'],
            'estimated_power_w': result['estimated_power_w'],
            'timestamp':         body.get('timestamp') or datetime.datetime.now().isoformat(),
            'inference_time_ms': result['inference_time_ms'],
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ─── Batch Predict ────────────────────────────────────────────

@app.route('/api/predict/batch', methods=['POST'])
def predict_batch():
    err = _models_check()
    if err: return err

    body = request.get_json(silent=True)
    key = 'rows' if body and 'rows' in body else ('readings' if body and 'readings' in body else None)
    if not key:
        return jsonify({'status': 'error', 'message': 'Provide "rows" or "readings" list'}), 400

    t0 = time.time()
    try:
        X = []
        for row in body[key]:
            if isinstance(row, dict):
                clf_row, _ = _build_features(row)
            elif isinstance(row, list):
                if len(row) != len(CLF_FEATURES):
                    raise ValueError(f'Expected {len(CLF_FEATURES)} values, got {len(row)}')
                clf_row = [float(v) for v in row]
            else:
                raise ValueError('Each row must be a dict or list')
            X.append(clf_row)

        X_scaled = _CLF_SC.transform(X)
        pred_idxs = _CLF.predict(X_scaled)
        probas    = _CLF.predict_proba(X_scaled)

        results = []
        for pred_idx, proba in zip(pred_idxs, probas):
            idx = int(pred_idx)
            results.append({
                'predicted_label': LABEL_MAP[idx],
                'appliance':       LABEL_MAP[idx],
                'confidence':      round(float(proba[idx]) * 100, 2),
                'probabilities':   {lbl: float(p) for lbl, p in zip(LABEL_MAP, proba)},
            })

        return jsonify({
            'status': 'success',
            'results': results,
            'predictions': results,
            'total_inference_ms': round((time.time() - t0) * 1000, 2),
        })
    except (KeyError, ValueError) as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/recommend', methods=['GET'])
def recommend():
    """
    Budget recommendation endpoint.
    Query params:
      budget_watts  — int, default 600
      loads         — comma-separated "Label:watts" pairs
    """
    try:
        budget = float(request.args.get('budget_watts', 600))
    except (ValueError, TypeError):
        return jsonify({'status': 'error', 'message': 'budget_watts must be a number'}), 400

    loads_param = request.args.get('loads', '')
    active = []
    if loads_param:
        for part in loads_param.split(','):
            part = part.strip()
            if ':' in part:
                name, w = part.rsplit(':', 1)
                try:
                    active.append({'appliance': name.strip(), 'power_w': float(w)})
                except ValueError:
                    pass

    total_w = sum(a['power_w'] for a in active)
    over_by = max(0.0, total_w - budget)

    # Sort by power descending; recommend turning off heaviest first
    sorted_loads = sorted(active, key=lambda x: x['power_w'], reverse=True)
    recs = []
    remaining = total_w
    for load in sorted_loads:
        if remaining <= budget:
            break
        action = 'TURN OFF' if load['power_w'] >= 200 else 'REDUCE'
        recs.append({'appliance': load['appliance'], 'action': action, 'saves_w': load['power_w']})
        remaining -= load['power_w']

    savings_pct = round((1 - remaining / total_w) * 100, 1) if total_w > 0 else 0

    return jsonify({
        'status':           'success',
        'total_current_w':  round(total_w, 2),
        'budget_w':         budget,
        'over_budget_by':   round(over_by, 2),
        'recommendations':  recs,
        'total_after_w':    round(remaining, 2),
        'savings_pct':      savings_pct,
    })

# ─── Load Manager ─────────────────────────────────────────────

@app.route('/api/loads', methods=['GET'])
def get_loads():
    db = get_db()
    rows = db.execute('SELECT * FROM loads ORDER BY created_at DESC').fetchall()
    return jsonify({'status': 'success', 'loads': [dict(r) for r in rows]})


@app.route('/api/loads', methods=['POST'])
def add_load():
    body = request.get_json(silent=True) or {}
    name = (body.get('name') or '').strip()
    power_watts = body.get('power_watts')
    hours_per_day = body.get('hours_per_day')
    priority = body.get('priority', 'medium').lower()

    if not name:
        return jsonify({'status': 'error', 'message': 'name is required'}), 400
    if power_watts is None or float(power_watts) <= 0:
        return jsonify({'status': 'error', 'message': 'power_watts must be > 0'}), 400
    if hours_per_day is None or not (0 < float(hours_per_day) <= 24):
        return jsonify({'status': 'error', 'message': 'hours_per_day must be between 0 and 24'}), 400
    if priority not in ('low', 'medium', 'high'):
        return jsonify({'status': 'error', 'message': 'priority must be low, medium, or high'}), 400

    db = get_db()
    cur = db.execute(
        'INSERT INTO loads (name, power_watts, hours_per_day, priority) VALUES (?, ?, ?, ?)',
        (name, float(power_watts), float(hours_per_day), priority)
    )
    db.commit()
    row = db.execute('SELECT * FROM loads WHERE id = ?', (cur.lastrowid,)).fetchone()
    return jsonify({'status': 'success', 'load': dict(row)}), 201


@app.route('/api/loads/<int:load_id>', methods=['PUT'])
def update_load(load_id):
    body = request.get_json(silent=True) or {}
    db = get_db()
    existing = db.execute('SELECT * FROM loads WHERE id = ?', (load_id,)).fetchone()
    if not existing:
        return jsonify({'status': 'error', 'message': 'Load not found'}), 404

    name = (body.get('name') or existing['name']).strip()
    power_watts = float(body.get('power_watts', existing['power_watts']))
    hours_per_day = float(body.get('hours_per_day', existing['hours_per_day']))
    priority = body.get('priority', existing['priority']).lower()

    if not name:
        return jsonify({'status': 'error', 'message': 'name is required'}), 400
    if power_watts <= 0:
        return jsonify({'status': 'error', 'message': 'power_watts must be > 0'}), 400
    if not (0 < hours_per_day <= 24):
        return jsonify({'status': 'error', 'message': 'hours_per_day must be between 0 and 24'}), 400
    if priority not in ('low', 'medium', 'high'):
        return jsonify({'status': 'error', 'message': 'priority must be low, medium, or high'}), 400

    db.execute(
        'UPDATE loads SET name=?, power_watts=?, hours_per_day=?, priority=? WHERE id=?',
        (name, power_watts, hours_per_day, priority, load_id)
    )
    db.commit()
    row = db.execute('SELECT * FROM loads WHERE id = ?', (load_id,)).fetchone()
    return jsonify({'status': 'success', 'load': dict(row)})


@app.route('/api/loads/<int:load_id>', methods=['DELETE'])
def delete_load(load_id):
    db = get_db()
    existing = db.execute('SELECT id FROM loads WHERE id = ?', (load_id,)).fetchone()
    if not existing:
        return jsonify({'status': 'error', 'message': 'Load not found'}), 404
    db.execute('DELETE FROM loads WHERE id = ?', (load_id,))
    db.commit()
    return jsonify({'status': 'success'})


@app.route('/api/loads/contribution', methods=['GET'])
def load_contribution():
    db = get_db()
    rows = db.execute('SELECT * FROM loads ORDER BY created_at DESC').fetchall()
    loads = [dict(r) for r in rows]

    for load in loads:
        load['energy_kwh_day'] = round((load['power_watts'] * load['hours_per_day']) / 1000, 4)

    total = sum(l['energy_kwh_day'] for l in loads)

    for load in loads:
        pct = (load['energy_kwh_day'] / total * 100) if total > 0 else 0
        load['contribution_pct'] = round(pct, 2)
        load['level'] = 'high' if pct >= 30 else ('medium' if pct >= 10 else 'low')

    loads_sorted = sorted(loads, key=lambda l: l['energy_kwh_day'], reverse=True)
    return jsonify({
        'status': 'success',
        'total_kwh_day': round(total, 4),
        'total_kwh_month': round(total * 30, 2),
        'loads': loads_sorted,
    })


# ─── Forecasting ──────────────────────────────────────────────

@app.route('/api/forecast', methods=['GET'])
def get_forecast():
    try:
        result = run_forecast()
        return jsonify({'status': 'success', **result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ─── Scheduling Suggestions ───────────────────────────────────

PEAK_START = 18  # 6 PM
PEAK_END   = 22  # 10 PM
PEAK_HOURS = PEAK_END - PEAK_START  # 4 hours

def _make_suggestion(load, energy_kwh_day, contribution_pct):
    power_w  = load['power_watts']
    hours    = load['hours_per_day']
    priority = load['priority']
    name     = load['name']

    # High-priority: always keep, but still give a monitoring tip
    if priority == 'high':
        return {
            'load_id': load['id'],
            'name': name,
            'action': 'keep',
            'reason': f'{name} is marked high priority — keep it running as needed.',
            'steps': [
                f'No action required for {name}.',
                'If it has an eco or energy-saving mode, enable it to passively reduce consumption.',
            ],
            'saving_kwh': 0,
            'urgency': 'none',
        }

    # Heavy load (≥500 W) running more hours than the peak window → shift
    if power_w >= 500 and hours > PEAK_HOURS:
        shiftable_hours = min(hours, PEAK_HOURS)
        saving = round((power_w * shiftable_hours) / 1000, 3)
        target_hours = round(hours - shiftable_hours, 1)
        return {
            'load_id': load['id'],
            'name': name,
            'action': 'shift',
            'reason': (
                f'{name} ({power_w} W) runs {hours} h/day and overlaps with peak hours '
                f'(6 PM – 10 PM). Shifting {shiftable_hours} h to off-peak can save ~{saving} kWh/day.'
            ),
            'steps': [
                f'Run {name} before 6:00 PM or after 10:00 PM whenever possible.',
                f'Reduce active peak-hour usage from {hours} h down to ~{target_hours} h during 6–10 PM.',
                f'If it has a timer or schedule feature, program it to start after 10 PM.',
                f'Estimated saving: {saving} kWh/day → {round(saving * 30, 2)} kWh/month.',
            ],
            'saving_kwh': saving,
            'urgency': 'high' if contribution_pct >= 30 else 'medium',
        }

    # Moderate load with high contribution → reduce daily hours
    if contribution_pct >= 20 and priority != 'high':
        reduce_by = round(hours * 0.25, 1)
        target_hours = round(hours - reduce_by, 1)
        saving = round(energy_kwh_day * 0.25, 3)
        return {
            'load_id': load['id'],
            'name': name,
            'action': 'reduce',
            'reason': (
                f'{name} accounts for {contribution_pct:.1f}% of your daily consumption. '
                f'Cutting its daily usage by 25% (from {hours} h to {target_hours} h) '
                f'would save ~{saving} kWh/day.'
            ),
            'steps': [
                f'Reduce daily usage of {name} from {hours} h/day to {target_hours} h/day.',
                f'Turn it off when not actively needed — avoid leaving it on standby.',
                f'If it has a sleep or auto-off timer, set it to {int(target_hours * 60)} minutes.',
                f'Estimated saving: {saving} kWh/day → {round(saving * 30, 2)} kWh/month.',
            ],
            'saving_kwh': saving,
            'urgency': 'medium',
        }

    # Low impact
    return {
        'load_id': load['id'],
        'name': name,
        'action': 'ok',
        'reason': f'{name} has low energy impact ({contribution_pct:.1f}% of total). No changes needed.',
        'steps': [
            f'{name} is already consuming a small share of your total energy.',
            'No action required at this time.',
        ],
        'saving_kwh': 0,
        'urgency': 'none',
    }


@app.route('/api/schedule', methods=['GET'])
def get_schedule():
    db = get_db()
    rows = db.execute('SELECT * FROM loads ORDER BY power_watts DESC').fetchall()
    loads = [dict(r) for r in rows]

    if not loads:
        return jsonify({
            'status': 'success',
            'suggestions': [],
            'total_potential_saving_kwh': 0,
            'peak_hours': {'start': PEAK_START, 'end': PEAK_END},
            'message': 'No appliances defined. Add appliances in Load Manager first.',
        })

    # Compute contribution for each load
    for load in loads:
        load['energy_kwh_day'] = (load['power_watts'] * load['hours_per_day']) / 1000

    total = sum(l['energy_kwh_day'] for l in loads) or 1

    suggestions = []
    for load in loads:
        pct = round(load['energy_kwh_day'] / total * 100, 2)
        s = _make_suggestion(load, load['energy_kwh_day'], pct)
        s['energy_kwh_day'] = round(load['energy_kwh_day'], 3)
        s['contribution_pct'] = pct
        suggestions.append(s)

    # Sort: high urgency first, then medium, then ok/none
    order = {'high': 0, 'medium': 1, 'none': 2}
    suggestions.sort(key=lambda s: order.get(s['urgency'], 2))

    total_saving = round(sum(s['saving_kwh'] for s in suggestions), 3)

    return jsonify({
        'status': 'success',
        'suggestions': suggestions,
        'total_potential_saving_kwh': total_saving,
        'total_potential_saving_month': round(total_saving * 30, 2),
        'peak_hours': {'start': PEAK_START, 'end': PEAK_END},
    })


# ─── Alert / Threshold System ─────────────────────────────────

def _get_setting(db, key, default=None):
    row = db.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
    return row['value'] if row else default


def _set_setting(db, key, value):
    db.execute(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        (key, str(value))
    )
    db.commit()


def _current_total_kwh(db):
    rows = db.execute('SELECT power_watts, hours_per_day FROM loads').fetchall()
    return sum((r['power_watts'] * r['hours_per_day']) / 1000 for r in rows)


@app.route('/api/alerts/threshold', methods=['GET'])
def get_threshold():
    db = get_db()
    value = _get_setting(db, 'daily_threshold_kwh')
    return jsonify({
        'status': 'success',
        'threshold_kwh': float(value) if value is not None else None,
    })


@app.route('/api/alerts/threshold', methods=['POST'])
def set_threshold():
    body = request.get_json(silent=True) or {}
    threshold = body.get('threshold_kwh')

    if threshold is None:
        return jsonify({'status': 'error', 'message': 'threshold_kwh is required'}), 400
    try:
        threshold = float(threshold)
        if threshold <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({'status': 'error', 'message': 'threshold_kwh must be a positive number'}), 400

    db = get_db()
    _set_setting(db, 'daily_threshold_kwh', threshold)
    return jsonify({'status': 'success', 'threshold_kwh': threshold})


@app.route('/api/alerts/status', methods=['GET'])
def alert_status():
    db = get_db()
    threshold_raw = _get_setting(db, 'daily_threshold_kwh')
    total_kwh = round(_current_total_kwh(db), 4)

    rows = db.execute('SELECT * FROM loads ORDER BY power_watts DESC').fetchall()
    loads = [dict(r) for r in rows]
    for load in loads:
        load['energy_kwh_day'] = round((load['power_watts'] * load['hours_per_day']) / 1000, 4)

    if threshold_raw is None:
        return jsonify({
            'status': 'success',
            'threshold_set': False,
            'total_kwh': total_kwh,
            'threshold_kwh': None,
            'exceeded': False,
            'usage_pct': None,
            'alerts': [],
            'load_count': len(loads),
        })

    threshold = float(threshold_raw)
    exceeded  = total_kwh > threshold
    usage_pct = round((total_kwh / threshold) * 100, 1) if threshold > 0 else 0

    alerts = []

    # Global threshold alert
    if exceeded:
        alerts.append({
            'level': 'critical',
            'title': 'Daily Threshold Exceeded',
            'message': (
                f'Your total daily consumption ({total_kwh} kWh) exceeds the '
                f'set threshold of {threshold} kWh by '
                f'{round(total_kwh - threshold, 3)} kWh. '
                f'Consider reducing or rescheduling high-usage appliances.'
            ),
        })
    elif usage_pct >= 80:
        alerts.append({
            'level': 'warning',
            'title': 'Approaching Threshold',
            'message': (
                f'You are at {usage_pct}% of your daily threshold ({threshold} kWh). '
                f'Current usage: {total_kwh} kWh. '
                f'Monitor high-usage appliances to stay within the limit.'
            ),
        })
    else:
        alerts.append({
            'level': 'ok',
            'title': 'Within Threshold',
            'message': (
                f'Daily consumption ({total_kwh} kWh) is within your threshold of {threshold} kWh '
                f'({usage_pct}% used).'
            ),
        })

    # Per-load alerts for appliances that alone exceed 50% of threshold
    for load in loads:
        single_pct = round((load['energy_kwh_day'] / threshold) * 100, 1)
        if single_pct >= 50:
            alerts.append({
                'level': 'warning',
                'title': f'{load["name"]} High Impact',
                'message': (
                    f'{load["name"]} alone consumes {load["energy_kwh_day"]} kWh/day '
                    f'({single_pct}% of your threshold). '
                    f'Consider reducing its usage hours.'
                ),
            })

    return jsonify({
        'status': 'success',
        'threshold_set': True,
        'total_kwh': total_kwh,
        'threshold_kwh': threshold,
        'exceeded': exceeded,
        'usage_pct': usage_pct,
        'alerts': alerts,
        'load_count': len(loads),
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
