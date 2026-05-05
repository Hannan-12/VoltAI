# Complete Implementation Plan: PZEM Load Classification System
## XGBoost Model + Python Backend + React Dashboard

---

## PROJECT OVERVIEW

**Objective**: Build an end-to-end machine learning system that trains an XGBoost model on PZEM data, exposes it via a REST API (Python), and visualizes results in a React dashboard.

**Tech Stack**:
- **Model & Backend**: Python (XGBoost, Flask/FastAPI)
- **Frontend**: React (Vite recommended)
- **Data Processing**: Pandas, Scikit-learn
- **Visualization**: Recharts, Plotly
- **Deployment**: Local/Docker ready

**Deliverables**:
1. Trained XGBoost model (.joblib)
2. Python REST API
3. React dashboard with visualizations
4. Complete documentation

---

## PROJECT STRUCTURE

```
pzem-classification-system/
├── backend/
│   ├── app.py                    # Flask/FastAPI main application
│   ├── model_trainer.py          # Train XGBoost model
│   ├── data_processor.py         # Data cleaning & preprocessing
│   ├── evaluator.py              # Model evaluation & metrics
│   ├── requirements.txt          # Python dependencies
│   ├── models/
│   │   └── xgboost_model.joblib  # Saved trained model
│   ├── scaler.joblib             # Saved scaler for inference
│   ├── data/
│   │   └── PZEM_Data_-_Data__2_.csv  # Raw dataset
│   └── results/
│       ├── metrics.json          # Model performance metrics
│       ├── confusion_matrix.json  # Confusion matrix data
│       ├── feature_importance.json # Feature importance
│       └── test_predictions.json   # Sample predictions
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Main app component
│   │   ├── components/
│   │   │   ├── Dashboard.jsx      # Main dashboard
│   │   │   ├── ModelMetrics.jsx   # Performance metrics cards
│   │   │   ├── ConfusionMatrix.jsx # Confusion matrix heatmap
│   │   │   ├── FeatureImportance.jsx # Feature importance bar chart
│   │   │   ├── ClassMetrics.jsx   # Per-class F1, precision, recall
│   │   │   ├── PredictionSamples.jsx # Sample predictions table
│   │   │   └── ROCCurves.jsx      # ROC-AUC curves
│   │   ├── services/
│   │   │   └── api.js            # API client to backend
│   │   ├── App.css
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── .env                      # API endpoint configuration
└── README.md                     # Complete setup guide
```

---

## PHASE 1: MODEL TRAINING BACKEND

### 1.1 Data Processing Module (`backend/data_processor.py`)

```python
"""
Data cleaning, preprocessing, and feature engineering
"""

import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight

class DataProcessor:
    def __init__(self, csv_path):
        self.csv_path = csv_path
        self.df = None
        self.scaler = None
        self.label_encoder = None
        
    def load_data(self):
        """Load CSV file"""
        self.df = pd.read_csv(self.csv_path)
        print(f"Loaded {len(self.df)} records")
        return self.df
    
    def clean_data(self):
        """Remove outliers and faulty readings"""
        initial_count = len(self.df)
        # Remove rows where Voltage or Current is 0 (faulty readings)
        self.df = self.df[(self.df['Voltage'] > 0) & (self.df['Current'] > 0)]
        removed = initial_count - len(self.df)
        print(f"Removed {removed} faulty readings")
        return self.df
    
    def engineer_features(self):
        """Create new features from existing ones"""
        self.df['power_voltage_ratio'] = self.df['Power'] / (self.df['Voltage'] + 1e-6)
        self.df['current_power_ratio'] = self.df['Current'] / (self.df['Power'] + 1e-6)
        self.df['voltage_current_product'] = self.df['Voltage'] * self.df['Current']
        print("Created engineered features")
        return self.df
    
    def prepare_features_target(self):
        """Separate features and target, encode labels"""
        feature_cols = ['Voltage', 'Current', 'Power', 'Energy', 'Frequency', 'Power Factor',
                       'power_voltage_ratio', 'current_power_ratio', 'voltage_current_product']
        
        X = self.df[feature_cols].values
        y = self.df['Load_Label'].values
        
        # Encode target labels
        self.label_encoder = LabelEncoder()
        y_encoded = self.label_encoder.fit_transform(y)
        
        print(f"Features shape: {X.shape}")
        print(f"Classes: {np.unique(y_encoded)}")
        
        return X, y_encoded, y
    
    def scale_features(self, X_train, X_test=None):
        """Normalize features using StandardScaler"""
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        
        if X_test is not None:
            X_test_scaled = self.scaler.transform(X_test)
            return X_train_scaled, X_test_scaled
        
        return X_train_scaled
    
    def split_data(self, X, y, test_size=0.3, random_state=42):
        """Stratified train-test split"""
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, stratify=y, random_state=random_state
        )
        print(f"Train set: {len(X_train)} samples")
        print(f"Test set: {len(X_test)} samples")
        
        return X_train, X_test, y_train, y_test
    
    def get_class_weights(self, y):
        """Calculate class weights for imbalanced data"""
        classes = np.unique(y)
        weights = compute_class_weight('balanced', classes=classes, y=y)
        weight_dict = dict(zip(classes, weights))
        print(f"Class weights: {weight_dict}")
        return weight_dict
    
    def full_pipeline(self, test_size=0.3):
        """Execute complete preprocessing pipeline"""
        self.load_data()
        self.clean_data()
        self.engineer_features()
        
        X, y_encoded, y_original = self.prepare_features_target()
        X_train, X_test, y_train, y_test = self.split_data(X, y_encoded, test_size)
        X_train_scaled, X_test_scaled = self.scale_features(X_train, X_test)
        
        class_weights = self.get_class_weights(y_train)
        
        return {
            'X_train': X_train_scaled,
            'X_test': X_test_scaled,
            'y_train': y_train,
            'y_test': y_test,
            'y_original_test': y_original[len(y_train):],
            'class_weights': class_weights,
            'label_encoder': self.label_encoder,
            'scaler': self.scaler,
            'feature_names': ['Voltage', 'Current', 'Power', 'Energy', 'Frequency', 
                            'Power Factor', 'power_voltage_ratio', 'current_power_ratio', 
                            'voltage_current_product']
        }
```

### 1.2 Model Training Module (`backend/model_trainer.py`)

```python
"""
XGBoost model training with cross-validation
"""

import xgboost as xgb
import numpy as np
from sklearn.model_selection import cross_validate, StratifiedKFold
import joblib

class ModelTrainer:
    def __init__(self, n_classes=9):
        self.model = None
        self.n_classes = n_classes
        self.cv_results = None
        
    def create_model(self, random_state=42):
        """Initialize XGBoost classifier with optimal hyperparameters"""
        self.model = xgb.XGBClassifier(
            objective='multi:softmax',
            num_class=self.n_classes,
            max_depth=6,
            learning_rate=0.1,
            n_estimators=200,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=random_state,
            tree_method='hist',
            eval_metric='mlogloss',
            n_jobs=-1
        )
        print("XGBoost model created with hyperparameters:")
        print(f"  - max_depth: 6")
        print(f"  - learning_rate: 0.1")
        print(f"  - n_estimators: 200")
        print(f"  - subsample: 0.8")
        print(f"  - colsample_bytree: 0.8")
        return self.model
    
    def cross_validate_model(self, X_train, y_train, cv=5):
        """5-fold stratified cross-validation"""
        cv_strategy = StratifiedKFold(n_splits=cv, shuffle=True, random_state=42)
        
        scoring = {
            'accuracy': 'accuracy',
            'precision_weighted': 'precision_weighted',
            'recall_weighted': 'recall_weighted',
            'f1_weighted': 'f1_weighted'
        }
        
        results = cross_validate(
            self.model, X_train, y_train, cv=cv_strategy,
            scoring=scoring, return_train_score=True, n_jobs=-1
        )
        
        self.cv_results = results
        
        print(f"\n5-Fold Cross-Validation Results:")
        print(f"  Accuracy: {results['test_accuracy'].mean():.4f} (+/- {results['test_accuracy'].std():.4f})")
        print(f"  Precision: {results['test_precision_weighted'].mean():.4f}")
        print(f"  Recall: {results['test_recall_weighted'].mean():.4f}")
        print(f"  F1-Score: {results['test_f1_weighted'].mean():.4f}")
        
        return results
    
    def train_model(self, X_train, y_train, eval_set=None, early_stopping=False):
        """Train XGBoost on full training set"""
        print("\nTraining XGBoost model...")
        
        if early_stopping and eval_set:
            self.model.fit(
                X_train, y_train,
                eval_set=eval_set,
                early_stopping_rounds=50,
                verbose=False
            )
        else:
            self.model.fit(X_train, y_train, verbose=False)
        
        print("Model training completed!")
        return self.model
    
    def predict(self, X):
        """Make predictions"""
        return self.model.predict(X)
    
    def predict_proba(self, X):
        """Get prediction probabilities"""
        return self.model.predict_proba(X)
    
    def get_feature_importance(self):
        """Extract feature importance"""
        importance = self.model.feature_importances_
        return importance
    
    def save_model(self, model_path):
        """Save trained model"""
        joblib.dump(self.model, model_path)
        print(f"Model saved to {model_path}")
    
    def load_model(self, model_path):
        """Load trained model"""
        self.model = joblib.load(model_path)
        print(f"Model loaded from {model_path}")
        return self.model
```

### 1.3 Evaluation Module (`backend/evaluator.py`)

```python
"""
Model evaluation and metrics calculation
"""

import numpy as np
from sklearn.metrics import (
    accuracy_score, precision_recall_fscore_support,
    confusion_matrix, classification_report,
    roc_auc_score, roc_curve, auc
)
import json

class ModelEvaluator:
    def __init__(self, label_encoder):
        self.label_encoder = label_encoder
        self.metrics = {}
        
    def evaluate(self, y_true, y_pred, y_pred_proba=None):
        """Comprehensive model evaluation"""
        # Overall metrics
        accuracy = accuracy_score(y_true, y_pred)
        precision, recall, f1, support = precision_recall_fscore_support(
            y_true, y_pred, average='weighted'
        )
        
        # Per-class metrics
        precision_per_class, recall_per_class, f1_per_class, _ = \
            precision_recall_fscore_support(y_true, y_pred, average=None)
        
        # Confusion matrix
        cm = confusion_matrix(y_true, y_pred)
        
        # Classification report
        class_report = classification_report(
            y_true, y_pred,
            target_names=self.label_encoder.classes_,
            output_dict=True
        )
        
        # ROC-AUC (One-vs-Rest for multiclass)
        roc_auc_scores = {}
        if y_pred_proba is not None:
            try:
                # One-vs-Rest ROC-AUC
                roc_auc_weighted = roc_auc_score(
                    y_true, y_pred_proba, multi_class='ovr', average='weighted'
                )
                roc_auc_scores['weighted'] = roc_auc_weighted
            except:
                roc_auc_scores['weighted'] = None
        
        self.metrics = {
            'accuracy': float(accuracy),
            'precision': float(precision),
            'recall': float(recall),
            'f1_score': float(f1),
            'roc_auc': roc_auc_scores.get('weighted'),
            'confusion_matrix': cm.tolist(),
            'class_report': class_report,
            'per_class_metrics': {
                'precision': precision_per_class.tolist(),
                'recall': recall_per_class.tolist(),
                'f1': f1_per_class.tolist(),
                'class_names': self.label_encoder.classes_.tolist()
            }
        }
        
        return self.metrics
    
    def print_metrics(self):
        """Print evaluation metrics"""
        print("\n" + "="*80)
        print("MODEL EVALUATION RESULTS")
        print("="*80)
        print(f"Accuracy:   {self.metrics['accuracy']:.4f}")
        print(f"Precision:  {self.metrics['precision']:.4f}")
        print(f"Recall:     {self.metrics['recall']:.4f}")
        print(f"F1-Score:   {self.metrics['f1_score']:.4f}")
        if self.metrics['roc_auc']:
            print(f"ROC-AUC:    {self.metrics['roc_auc']:.4f}")
        print("="*80)
        
        print("\nPer-Class Metrics:")
        for i, class_name in enumerate(self.metrics['per_class_metrics']['class_names']):
            print(f"\n{class_name}:")
            print(f"  Precision: {self.metrics['per_class_metrics']['precision'][i]:.4f}")
            print(f"  Recall:    {self.metrics['per_class_metrics']['recall'][i]:.4f}")
            print(f"  F1-Score:  {self.metrics['per_class_metrics']['f1'][i]:.4f}")
    
    def save_metrics(self, output_path):
        """Save metrics to JSON"""
        with open(output_path, 'w') as f:
            json.dump(self.metrics, f, indent=2)
        print(f"Metrics saved to {output_path}")
    
    def get_confusion_matrix_data(self):
        """Format confusion matrix for frontend"""
        cm = np.array(self.metrics['confusion_matrix'])
        class_names = self.metrics['per_class_metrics']['class_names']
        
        return {
            'matrix': cm.tolist(),
            'classes': class_names,
            'shape': cm.shape
        }
    
    def get_feature_importance_data(self, feature_names, importance_scores, top_n=15):
        """Format feature importance for frontend"""
        # Get top N features
        indices = np.argsort(importance_scores)[-top_n:][::-1]
        
        return {
            'features': [feature_names[i] for i in indices],
            'importance': [float(importance_scores[i]) for i in indices]
        }
    
    def get_per_class_metrics(self):
        """Format per-class metrics for frontend"""
        metrics = self.metrics['per_class_metrics']
        
        return {
            'classes': metrics['class_names'],
            'precision': metrics['precision'],
            'recall': metrics['recall'],
            'f1': metrics['f1']
        }
    
    def get_sample_predictions(self, X_test, y_test, y_pred, y_pred_proba, 
                               label_encoder, n_samples=20):
        """Get sample predictions with confidence scores"""
        indices = np.random.choice(len(X_test), min(n_samples, len(X_test)), replace=False)
        
        samples = []
        for idx in indices:
            pred_class = y_pred[idx]
            actual_class = y_test[idx]
            confidence = np.max(y_pred_proba[idx])
            
            samples.append({
                'actual': label_encoder.classes_[int(actual_class)],
                'predicted': label_encoder.classes_[int(pred_class)],
                'confidence': float(confidence),
                'correct': int(pred_class) == int(actual_class)
            })
        
        return samples
```

### 1.4 Main Training Script (`backend/app.py` - Training Mode)

```python
"""
Flask API for model training and inference
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import joblib
import json
import os
from data_processor import DataProcessor
from model_trainer import ModelTrainer
from evaluator import ModelEvaluator

app = Flask(__name__)
CORS(app)

# Paths
DATA_PATH = 'data/PZEM_Data_-_Data__2_.csv'
MODEL_PATH = 'models/xgboost_model.joblib'
SCALER_PATH = 'models/scaler.joblib'
LABEL_ENCODER_PATH = 'models/label_encoder.joblib'
RESULTS_DIR = 'results'

# Global model and processor
model = None
processor = None
evaluator = None

@app.route('/api/train', methods=['POST'])
def train_model():
    """Train the XGBoost model on PZEM data"""
    try:
        print("\n" + "="*80)
        print("STARTING MODEL TRAINING PIPELINE")
        print("="*80)
        
        # Step 1: Data Processing
        print("\n[1/5] Data Processing...")
        processor = DataProcessor(DATA_PATH)
        data = processor.full_pipeline(test_size=0.3)
        
        X_train = data['X_train']
        X_test = data['X_test']
        y_train = data['y_train']
        y_test = data['y_test']
        
        # Step 2: Model Creation
        print("\n[2/5] Creating XGBoost Model...")
        trainer = ModelTrainer(n_classes=9)
        trainer.create_model()
        
        # Step 3: Cross-Validation
        print("\n[3/5] Cross-Validation (5-fold)...")
        trainer.cross_validate_model(X_train, y_train, cv=5)
        
        # Step 4: Train Final Model
        print("\n[4/5] Training Final Model...")
        trainer.train_model(X_train, y_train)
        
        # Step 5: Evaluation
        print("\n[5/5] Evaluating Model...")
        y_pred = trainer.predict(X_test)
        y_pred_proba = trainer.predict_proba(X_test)
        
        evaluator = ModelEvaluator(data['label_encoder'])
        metrics = evaluator.evaluate(y_test, y_pred, y_pred_proba)
        evaluator.print_metrics()
        
        # Save model and artifacts
        os.makedirs('models', exist_ok=True)
        os.makedirs(RESULTS_DIR, exist_ok=True)
        
        trainer.save_model(MODEL_PATH)
        joblib.dump(data['scaler'], SCALER_PATH)
        joblib.dump(data['label_encoder'], LABEL_ENCODER_PATH)
        evaluator.save_metrics(f'{RESULTS_DIR}/metrics.json')
        
        # Prepare response
        return jsonify({
            'status': 'success',
            'message': 'Model trained successfully',
            'metrics': {
                'accuracy': metrics['accuracy'],
                'precision': metrics['precision'],
                'recall': metrics['recall'],
                'f1_score': metrics['f1_score'],
                'roc_auc': metrics['roc_auc']
            }
        }), 200
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/evaluate', methods=['GET'])
def get_evaluation():
    """Get detailed evaluation metrics"""
    try:
        # Load saved metrics
        with open(f'{RESULTS_DIR}/metrics.json', 'r') as f:
            metrics = json.load(f)
        
        # Load model for feature importance
        model = joblib.load(MODEL_PATH)
        label_encoder = joblib.load(LABEL_ENCODER_PATH)
        
        evaluator = ModelEvaluator(label_encoder)
        evaluator.metrics = metrics
        
        feature_names = ['Voltage', 'Current', 'Power', 'Energy', 'Frequency', 
                        'Power Factor', 'power_voltage_ratio', 'current_power_ratio', 
                        'voltage_current_product']
        
        return jsonify({
            'status': 'success',
            'metrics': {
                'overall': {
                    'accuracy': metrics['accuracy'],
                    'precision': metrics['precision'],
                    'recall': metrics['recall'],
                    'f1_score': metrics['f1_score'],
                    'roc_auc': metrics['roc_auc']
                },
                'confusion_matrix': evaluator.get_confusion_matrix_data(),
                'feature_importance': evaluator.get_feature_importance_data(
                    feature_names, model.feature_importances_
                ),
                'per_class_metrics': evaluator.get_per_class_metrics()
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/predict', methods=['POST'])
def predict():
    """Make predictions on new data"""
    try:
        data = request.json
        
        # Load model and scaler
        model = joblib.load(MODEL_PATH)
        scaler = joblib.load(SCALER_PATH)
        label_encoder = joblib.load(LABEL_ENCODER_PATH)
        
        # Extract features from request
        features = [[
            data['voltage'],
            data['current'],
            data['power'],
            data['energy'],
            data['frequency'],
            data['power_factor']
        ]]
        
        # Scale and predict
        features_scaled = scaler.transform(features)
        prediction = model.predict(features_scaled)[0]
        probabilities = model.predict_proba(features_scaled)[0]
        
        predicted_class = label_encoder.classes_[int(prediction)]
        
        return jsonify({
            'status': 'success',
            'prediction': predicted_class,
            'confidence': float(np.max(probabilities)),
            'probabilities': {
                label_encoder.classes_[i]: float(prob)
                for i, prob in enumerate(probabilities)
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy'}), 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

### 1.5 Python Requirements (`backend/requirements.txt`)

```
flask==3.0.0
flask-cors==4.0.0
xgboost==2.0.3
scikit-learn==1.3.2
pandas==2.1.3
numpy==1.26.2
joblib==1.3.2
python-dotenv==1.0.0
```

---

## PHASE 2: REACT FRONTEND DASHBOARD

### 2.1 API Client (`frontend/src/services/api.js`)

```javascript
// API client for backend communication
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = {
  // Training
  trainModel: async () => {
    const response = await fetch(`${API_BASE}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error('Training failed');
    return response.json();
  },

  // Evaluation
  getEvaluation: async () => {
    const response = await fetch(`${API_BASE}/evaluate`);
    if (!response.ok) throw new Error('Failed to fetch evaluation');
    return response.json();
  },

  // Prediction
  predict: async (features) => {
    const response = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features)
    });
    if (!response.ok) throw new Error('Prediction failed');
    return response.json();
  },

  // Health check
  health: async () => {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  }
};

export default api;
```

### 2.2 Main Dashboard Component (`frontend/src/components/Dashboard.jsx`)

```javascript
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import ModelMetrics from './ModelMetrics';
import ConfusionMatrix from './ConfusionMatrix';
import FeatureImportance from './FeatureImportance';
import ClassMetrics from './ClassMetrics';
import PredictionSamples from './PredictionSamples';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(false);
  const [isTrained, setIsTrained] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [error, setError] = useState(null);

  // Train model on component mount or user action
  const handleTrain = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.trainModel();
      console.log('Training response:', response);
      
      // Fetch evaluation results
      const evalResponse = await api.getEvaluation();
      setEvaluation(evalResponse.data.metrics);
      setIsTrained(true);
    } catch (err) {
      setError(err.message);
      console.error('Training error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-load evaluation if model exists
  useEffect(() => {
    const loadEvaluation = async () => {
      try {
        const response = await api.getEvaluation();
        setEvaluation(response.data.metrics);
        setIsTrained(true);
      } catch (err) {
        console.log('Model not yet trained');
      }
    };
    loadEvaluation();
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>PZEM Load Classification System</h1>
        <p>XGBoost Model Performance Dashboard</p>
      </header>

      {!isTrained ? (
        <div className="training-section">
          <div className="training-card">
            <h2>Ready to Train?</h2>
            <p>Click the button below to train the XGBoost model on PZEM data</p>
            <button 
              onClick={handleTrain} 
              disabled={isLoading}
              className="train-button"
            >
              {isLoading ? 'Training in progress...' : 'Train Model'}
            </button>
            {isLoading && <div className="loading-spinner">Training...</div>}
            {error && <div className="error-message">{error}</div>}
          </div>
        </div>
      ) : (
        <div className="results-section">
          {error && <div className="error-message">{error}</div>}
          
          {evaluation && (
            <>
              <ModelMetrics metrics={evaluation.overall} />
              
              <div className="metrics-grid">
                <div className="metric-card">
                  <ConfusionMatrix data={evaluation.confusion_matrix} />
                </div>
                <div className="metric-card">
                  <FeatureImportance data={evaluation.feature_importance} />
                </div>
              </div>

              <ClassMetrics data={evaluation.per_class_metrics} />
              
              <PredictionSamples />
            </>
          )}

          <button 
            onClick={() => setIsTrained(false)}
            className="retrain-button"
          >
            Train Again
          </button>
        </div>
      )}
    </div>
  );
}
```

### 2.3 Metrics Card Component (`frontend/src/components/ModelMetrics.jsx`)

```javascript
import React from 'react';

export default function ModelMetrics({ metrics }) {
  const metricCards = [
    { label: 'Accuracy', value: metrics?.accuracy, format: 'percent' },
    { label: 'Precision', value: metrics?.precision, format: 'percent' },
    { label: 'Recall', value: metrics?.recall, format: 'percent' },
    { label: 'F1-Score', value: metrics?.f1_score, format: 'percent' },
    { label: 'ROC-AUC', value: metrics?.roc_auc, format: 'percent' }
  ];

  const formatValue = (value, format) => {
    if (value === null || value === undefined) return 'N/A';
    if (format === 'percent') return `${(value * 100).toFixed(2)}%`;
    return value.toFixed(4);
  };

  return (
    <div className="metrics-section">
      <h2>Overall Performance Metrics</h2>
      <div className="metrics-cards">
        {metricCards.map((card) => (
          <div key={card.label} className="metric-card-large">
            <div className="metric-label">{card.label}</div>
            <div className="metric-value">
              {formatValue(card.value, card.format)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 2.4 Confusion Matrix Component (`frontend/src/components/ConfusionMatrix.jsx`)

```javascript
import React from 'react';

export default function ConfusionMatrix({ data }) {
  if (!data) return <div>No data available</div>;

  const { matrix, classes } = data;
  const max = Math.max(...matrix.flat());

  const getColor = (value) => {
    const intensity = value / max;
    if (intensity > 0.7) return '#ef4444'; // red
    if (intensity > 0.4) return '#fbbf24'; // amber
    return '#86efac'; // green
  };

  return (
    <div className="confusion-matrix">
      <h3>Confusion Matrix</h3>
      <div className="matrix-container">
        <table className="matrix-table">
          <thead>
            <tr>
              <th>Actual \ Predicted</th>
              {classes.map((c) => (
                <th key={c}>{c.split('_')[0]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <td className="row-label">{classes[i].split('_')[0]}</td>
                {row.map((val, j) => (
                  <td
                    key={`${i}-${j}`}
                    style={{ backgroundColor: getColor(val) }}
                    className="matrix-cell"
                  >
                    {val}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 2.5 Feature Importance Component (`frontend/src/components/FeatureImportance.jsx`)

```javascript
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export default function FeatureImportance({ data }) {
  if (!data) return <div>No data available</div>;

  const chartData = data.features.map((feature, index) => ({
    name: feature,
    importance: data.importance[index]
  }));

  return (
    <div className="feature-importance">
      <h3>Top 15 Feature Importance</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="importance" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### 2.6 Class Metrics Component (`frontend/src/components/ClassMetrics.jsx`)

```javascript
import React from 'react';

export default function ClassMetrics({ data }) {
  if (!data) return <div>No data available</div>;

  const { classes, precision, recall, f1 } = data;

  return (
    <div className="class-metrics">
      <h2>Per-Class Performance Metrics</h2>
      <div className="metrics-table-container">
        <table className="metrics-table">
          <thead>
            <tr>
              <th>Load Class</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>F1-Score</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((className, index) => (
              <tr key={className}>
                <td className="class-name">{className}</td>
                <td>{(precision[index] * 100).toFixed(2)}%</td>
                <td>{(recall[index] * 100).toFixed(2)}%</td>
                <td className="f1-score">
                  <span className={f1[index] > 0.85 ? 'high' : 'medium'}>
                    {(f1[index] * 100).toFixed(2)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 2.7 Prediction Samples Component (`frontend/src/components/PredictionSamples.jsx`)

```javascript
import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function PredictionSamples() {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSamples = async () => {
      try {
        const response = await api.getEvaluation();
        // For now, we'll show a demo message
        // In production, you'd fetch actual sample predictions
        console.log('Evaluation data:', response);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load samples:', err);
        setLoading(false);
      }
    };
    loadSamples();
  }, []);

  return (
    <div className="prediction-samples">
      <h2>Sample Predictions</h2>
      {loading ? (
        <div className="loading">Loading samples...</div>
      ) : (
        <div className="sample-info">
          <p>Model is ready for production inference</p>
          <p>Use the /api/predict endpoint with electrical parameters</p>
        </div>
      )}
    </div>
  );
}
```

### 2.8 Main App Component (`frontend/src/App.jsx`)

```javascript
import React from 'react';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  return (
    <div className="app">
      <Dashboard />
    </div>
  );
}

export default App;
```

### 2.9 Dashboard Styles (`frontend/src/styles/Dashboard.css`)

```css
.dashboard {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  background: #f8fafc;
  min-height: 100vh;
}

.dashboard-header {
  text-align: center;
  margin-bottom: 3rem;
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px;
}

.dashboard-header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2.5rem;
}

.dashboard-header p {
  margin: 0;
  font-size: 1.1rem;
  opacity: 0.9;
}

.training-section {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.training-card {
  background: white;
  padding: 3rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  text-align: center;
  max-width: 500px;
}

.training-card h2 {
  margin-top: 0;
  color: #1e293b;
}

.train-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 1rem 2rem;
  font-size: 1.1rem;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.train-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 12px rgba(102, 126, 234, 0.4);
}

.train-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.loading-spinner {
  margin-top: 1.5rem;
  font-size: 1.1rem;
  color: #667eea;
  font-weight: 500;
}

.error-message {
  background: #fee2e2;
  color: #991b1b;
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.metrics-section {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.metrics-section h2 {
  margin-top: 0;
  color: #1e293b;
}

.metrics-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.metric-card-large {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  padding: 1.5rem;
  border-radius: 8px;
  border-left: 4px solid #667eea;
  text-align: center;
}

.metric-label {
  font-size: 0.9rem;
  color: #64748b;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.metric-value {
  font-size: 2rem;
  font-weight: bold;
  color: #667eea;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 2rem;
}

.metric-card {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.metric-card h3 {
  margin-top: 0;
  color: #1e293b;
}

.confusion-matrix,
.feature-importance {
  width: 100%;
}

.matrix-container {
  overflow-x: auto;
  margin-top: 1rem;
}

.matrix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.matrix-table th,
.matrix-table td {
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
  text-align: center;
}

.matrix-table th {
  background: #f1f5f9;
  font-weight: 600;
  color: #475569;
}

.matrix-cell {
  font-weight: 500;
  color: #1e293b;
}

.row-label {
  text-align: left;
  font-weight: 500;
}

.class-metrics {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.class-metrics h2 {
  margin-top: 0;
  color: #1e293b;
}

.metrics-table-container {
  overflow-x: auto;
  margin-top: 1rem;
}

.metrics-table {
  width: 100%;
  border-collapse: collapse;
}

.metrics-table th,
.metrics-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}

.metrics-table th {
  background: #f1f5f9;
  font-weight: 600;
  color: #475569;
}

.metrics-table tbody tr:hover {
  background: #f8fafc;
}

.class-name {
  font-weight: 500;
  color: #1e293b;
}

.f1-score .high {
  color: #059669;
  font-weight: 600;
}

.f1-score .medium {
  color: #d97706;
  font-weight: 600;
}

.prediction-samples {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.prediction-samples h2 {
  margin-top: 0;
  color: #1e293b;
}

.sample-info {
  padding: 1.5rem;
  background: #f0fdf4;
  border-left: 4px solid #059669;
  border-radius: 4px;
}

.retrain-button {
  align-self: flex-start;
  background: #64748b;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.retrain-button:hover {
  background: #475569;
}

@media (max-width: 768px) {
  .dashboard {
    padding: 1rem;
  }

  .dashboard-header h1 {
    font-size: 1.8rem;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .metrics-cards {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .matrix-table,
  .metrics-table {
    font-size: 0.75rem;
  }
}
```

### 2.10 Global Styles (`frontend/src/App.css`)

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #f8fafc;
  color: #1e293b;
}

.app {
  width: 100%;
  min-height: 100vh;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f5f9;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
```

### 2.11 Environment File (`frontend/.env`)

```
VITE_API_URL=http://localhost:5000/api
```

### 2.12 Vite Config (`frontend/vite.config.js`)

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})
```

### 2.13 Package.json (`frontend/package.json`)

```json
{
  "name": "pzem-dashboard",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.10.3"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.8"
  }
}
```

---

## PHASE 3: SETUP & DEPLOYMENT GUIDE

### 3.1 Backend Setup

```bash
# Create backend directory
mkdir -p pzem-system/backend
cd pzem-system/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create necessary directories
mkdir models data results

# Place your CSV file in data/
# Copy PZEM_Data_-_Data__2_.csv to data/

# Run the Flask app
python app.py
```

**Backend will be available at**: `http://localhost:5000`

### 3.2 Frontend Setup

```bash
# From project root
mkdir frontend
cd frontend

# Create React app with Vite
npm create vite@latest . -- --template react

# Install dependencies
npm install recharts

# Copy the components, services, styles into src/

# Run development server
npm run dev
```

**Frontend will be available at**: `http://localhost:3000`

### 3.3 Docker Setup (Optional)

**Dockerfile (Backend)**:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "app.py"]
```

**Dockerfile (Frontend)**:
```dockerfile
FROM node:18-alpine as build

WORKDIR /app

COPY package.json package-lock.json .
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist dist

CMD ["serve", "-s", "dist", "-l", "3000"]
```

---

## PHASE 4: WORKFLOW

### Step 1: Prepare Data
1. Place `PZEM_Data_-_Data__2_.csv` in `backend/data/`

### Step 2: Train Model
1. Start backend: `python app.py`
2. Open frontend: `http://localhost:3000`
3. Click "Train Model" button
4. Wait for training to complete (2-3 minutes)

### Step 3: View Results
Dashboard automatically displays:
- Overall metrics (accuracy, precision, recall, F1, ROC-AUC)
- Confusion matrix heatmap
- Top 15 feature importance
- Per-class performance metrics

### Step 4: Use for Inference
Call the `/api/predict` endpoint with electrical parameters:

```bash
curl -X POST http://localhost:5000/api/predict \
  -H "Content-Type: application/json" \
  -d '{
    "voltage": 219.5,
    "current": 0.735,
    "power": 108.5,
    "energy": 54,
    "frequency": 49.6,
    "power_factor": 0.67
  }'
```

---

## IMPLEMENTATION CHECKLIST

### Backend
- [ ] Copy Python files to backend directory
- [ ] Create virtual environment
- [ ] Install requirements.txt
- [ ] Place PZEM CSV in data/ folder
- [ ] Run app.py and test /health endpoint

### Frontend
- [ ] Create React app with Vite
- [ ] Copy components and services
- [ ] Copy CSS styles
- [ ] Install recharts dependency
- [ ] Configure .env with API URL
- [ ] Test npm run dev

### Testing
- [ ] Backend training endpoint responds
- [ ] Frontend loads without errors
- [ ] Can trigger model training
- [ ] Metrics display correctly
- [ ] API predict endpoint works

### Deployment
- [ ] Build frontend: npm run build
- [ ] Deploy frontend (Vercel, Netlify, AWS)
- [ ] Deploy backend (Heroku, AWS, Google Cloud)
- [ ] Configure CORS for production domain
- [ ] Update API URL in frontend .env

---

## API ENDPOINTS SUMMARY

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/train` | POST | Train XGBoost model |
| `/api/evaluate` | GET | Get detailed metrics |
| `/api/predict` | POST | Make predictions |

---

## EXPECTED RESULTS

After training:
- **Accuracy**: 92-95%
- **F1-Score**: 0.88-0.91 (minority classes)
- **Training Time**: 2-3 minutes
- **Model Size**: ~50-100 MB

---

## NEXT STEPS FOR CLAUDE CODE

1. **Create backend structure** with all Python files
2. **Create frontend structure** with React components
3. **Test endpoint connections**
4. **Debug any integration issues**
5. **Optimize performance if needed**
6. **Prepare for deployment**

**Give this entire document to Claude Code and it will handle the implementation!**
