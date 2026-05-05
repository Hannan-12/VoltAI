# Quick Reference: Claude Code Implementation Guide

## TLDR - What to Build

You're building a 3-layer system:

1. **Python Backend** (Flask API)
   - Trains XGBoost model on PZEM data
   - Exposes `/api/train`, `/api/evaluate`, `/api/predict` endpoints
   - Saves model artifacts to disk

2. **React Frontend** (Vite)
   - Dashboard showing model metrics
   - Confusion matrix heatmap
   - Feature importance chart
   - Per-class performance table
   - Training trigger button

3. **Connect them** via REST API (localhost:5000 ↔ localhost:3000)

---

## File Structure to Create

```
backend/
  ├── app.py                 ← Main Flask app
  ├── data_processor.py      ← Clean & prepare data
  ├── model_trainer.py       ← Train XGBoost
  ├── evaluator.py           ← Calculate metrics
  ├── requirements.txt       ← Python packages
  ├── models/                ← Save model here
  ├── data/                  ← CSV goes here
  └── results/               ← JSON metrics

frontend/
  ├── src/
  │   ├── App.jsx
  │   ├── services/api.js    ← HTTP calls
  │   └── components/
  │       ├── Dashboard.jsx
  │       ├── ModelMetrics.jsx
  │       ├── ConfusionMatrix.jsx
  │       ├── FeatureImportance.jsx
  │       ├── ClassMetrics.jsx
  │       └── PredictionSamples.jsx
  ├── package.json
  └── vite.config.js
```

---

## Implementation Steps (Order Matters)

### Step 1: Backend Core (10 min)
1. Create `app.py` with Flask + CORS
2. Add `/api/health` endpoint (test it works)
3. Create `data_processor.py` (DataProcessor class)
4. Create `model_trainer.py` (ModelTrainer class)
5. Create `evaluator.py` (ModelEvaluator class)
6. Create `requirements.txt`

**Test**: `python app.py` → visit `http://localhost:5000/api/health` → should return `{"status": "healthy"}`

### Step 2: Backend Training Pipeline (5 min)
1. Add `/api/train` endpoint to `app.py`
2. This should:
   - Call DataProcessor.full_pipeline()
   - Call ModelTrainer.train_model()
   - Call ModelEvaluator.evaluate()
   - Save everything to disk

**Test**: POST to `http://localhost:5000/api/train` → should return metrics

### Step 3: Backend Evaluation Endpoint (5 min)
1. Add `/api/evaluate` endpoint
2. Load saved model + metrics
3. Return formatted JSON for frontend

**Test**: GET `http://localhost:5000/api/evaluate` → see all metrics

### Step 4: Frontend Setup (5 min)
1. Create React app with Vite
2. Create `src/services/api.js` (fetch wrapper)
3. Create basic App.jsx structure

**Test**: `npm run dev` → opens on `http://localhost:3000`

### Step 5: Dashboard Components (15 min)
1. Dashboard.jsx - Main container
2. ModelMetrics.jsx - 5 metric cards (accuracy, precision, recall, F1, ROC-AUC)
3. ConfusionMatrix.jsx - Heatmap table
4. FeatureImportance.jsx - Bar chart (use Recharts)
5. ClassMetrics.jsx - Per-class table
6. PredictionSamples.jsx - Sample predictions

### Step 6: Styling (10 min)
1. Add Dashboard.css
2. Add App.css
3. Make it look professional

---

## Critical Code Snippets

### Backend: Train Model Endpoint
```python
@app.route('/api/train', methods=['POST'])
def train_model():
    processor = DataProcessor('data/PZEM_Data_-_Data__2_.csv')
    data = processor.full_pipeline()
    
    trainer = ModelTrainer(n_classes=9)
    trainer.create_model()
    trainer.train_model(data['X_train'], data['y_train'])
    
    y_pred = trainer.predict(data['X_test'])
    evaluator = ModelEvaluator(data['label_encoder'])
    metrics = evaluator.evaluate(data['y_test'], y_pred)
    
    trainer.save_model('models/xgboost_model.joblib')
    evaluator.save_metrics('results/metrics.json')
    
    return jsonify({
        'status': 'success',
        'metrics': {
            'accuracy': metrics['accuracy'],
            'f1_score': metrics['f1_score']
        }
    })
```

### Frontend: Train Model
```javascript
const handleTrain = async () => {
  setIsLoading(true);
  try {
    await api.trainModel();
    const response = await api.getEvaluation();
    setEvaluation(response.data.metrics);
  } catch (err) {
    setError(err.message);
  }
  setIsLoading(false);
};
```

### Confusion Matrix Display
```javascript
const getColor = (value) => {
  const intensity = value / Math.max(...matrix.flat());
  if (intensity > 0.7) return '#ef4444'; // red = high
  if (intensity > 0.4) return '#fbbf24'; // orange
  return '#86efac'; // green = low
};
```

---

## Common Issues & Fixes

### Issue: "CORS error"
**Fix**: Add to Flask app
```python
from flask_cors import CORS
CORS(app)
```

### Issue: "Model file not found"
**Fix**: Create directories first
```python
import os
os.makedirs('models', exist_ok=True)
os.makedirs('results', exist_ok=True)
```

### Issue: "CSV not found"
**Fix**: Check file path, copy CSV to `backend/data/`

### Issue: "React can't reach backend"
**Fix**: Make sure backend running on 5000, update `.env`
```
VITE_API_URL=http://localhost:5000/api
```

### Issue: "Training takes too long"
**Fix**: Normal! 2-3 minutes is expected. Reduce n_estimators if needed.

---

## Testing Checklist

```
[ ] Backend starts: python app.py
[ ] Health check works: GET /api/health
[ ] Training completes: POST /api/train (wait 2-3 min)
[ ] Evaluation loads: GET /api/evaluate
[ ] Frontend starts: npm run dev
[ ] Dashboard displays: http://localhost:3000
[ ] Metrics show on page
[ ] Confusion matrix renders
[ ] Feature chart displays
[ ] No console errors
[ ] No network errors (F12 → Network tab)
```

---

## Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Accuracy | 92-95% | Will vary |
| F1-Score | 0.88+ | Will vary |
| Training Time | 2-3 min | Expected |
| Model Size | <100MB | Expected |

---

## Data Flow Diagram

```
┌─────────────┐
│ PZEM CSV    │
│ (359K rows) │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ DataProcessor    │ Clean, engineer, scale
└──────┬───────────┘
       │
       ├─→ X_train (251K) → 
       │                    ┌──────────────┐
       │                    │ ModelTrainer │ Train XGBoost
       │                    └──────┬───────┘
       │                           │
       └─→ X_test (107K)  →       │ 
                                   ▼
                           ┌──────────────────┐
                           │ ModelEvaluator   │ Calculate metrics
                           └──────┬───────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              metrics.json  confusion.json  model.joblib
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                    ┌─────────────▼──────────┐
                    │ React Dashboard        │
                    │ (Display all metrics)  │
                    └────────────────────────┘
```

---

## When Claude Code Asks Questions

**"Where should I put X?"**
→ Look at the file structure above

**"What should this function return?"**
→ Look at the endpoint docstring

**"How do I connect frontend to backend?"**
→ Use `api.js` as the client, calls localhost:5000

**"Should I add more features?"**
→ No, keep it simple. Just training + evaluation + display.

**"Can I use a different chart library?"**
→ Yes, but Recharts is already provided in the code

---

## Final Deployment

After everything works locally:

1. **Backend**: Deploy to Heroku/Railway/Render
   - Update `FLASK_ENV=production`
   - Enable production CORS with specific domains
   
2. **Frontend**: Deploy to Vercel/Netlify
   - Update `VITE_API_URL` to production backend URL
   - Run `npm run build` locally to test

3. **Docker** (Optional):
   - Use provided Dockerfiles
   - Deploy to any container platform

---

## Ask Claude Code to:

1. ✅ Create all Python files with exact code
2. ✅ Create all React components with exact code
3. ✅ Create CSS files
4. ✅ Create config files (package.json, vite.config.js, etc.)
5. ✅ Create requirements.txt
6. ✅ Test that `/api/health` works
7. ✅ Test that `/api/train` trains the model
8. ✅ Test that frontend displays metrics

Don't ask Claude Code to:
- ❌ Explain machine learning theory
- ❌ Debug complex algorithms
- ❌ Make design decisions beyond the spec
- ❌ Write extra features

---

**You have everything you need. Give the full COMPLETE_IMPLEMENTATION_PLAN.md to Claude Code and it will build it!**
