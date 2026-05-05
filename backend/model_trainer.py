import numpy as np
import xgboost as xgb
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score
from sklearn.utils.class_weight import compute_sample_weight
import joblib
import os
import json

MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')


def train(X_train, y_train, n_classes):
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(RESULTS_DIR, exist_ok=True)

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric='mlogloss',
        random_state=42,
        n_jobs=-1,
        num_class=n_classes,
    )

    # Inverse-frequency weights so rare classes (e.g. Refrigerator_IDLE=7 rows)
    # get proportionally higher penalty on misclassification
    sample_weights = compute_sample_weight(class_weight='balanced', y=y_train)

    # Manual CV loop — cross_val_score fit_params support varies by sklearn version
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = []
    for train_idx, val_idx in cv.split(X_train, y_train):
        fold_model = xgb.XGBClassifier(
            n_estimators=200, max_depth=6, learning_rate=0.1,
            subsample=0.8, colsample_bytree=0.8,
            use_label_encoder=False, eval_metric='mlogloss',
            random_state=42, n_jobs=-1,
        )
        fold_model.fit(
            X_train[train_idx], y_train[train_idx],
            sample_weight=sample_weights[train_idx]
        )
        preds = fold_model.predict(X_train[val_idx])
        cv_scores.append(accuracy_score(y_train[val_idx], preds))
    cv_scores = np.array(cv_scores)

    model.fit(X_train, y_train, sample_weight=sample_weights)

    joblib.dump(model, os.path.join(MODELS_DIR, 'xgb_model.pkl'))

    cv_results = {
        'cv_scores': cv_scores.tolist(),
        'cv_mean': float(cv_scores.mean()),
        'cv_std': float(cv_scores.std()),
    }
    with open(os.path.join(RESULTS_DIR, 'cv_results.json'), 'w') as f:
        json.dump(cv_results, f, indent=2)

    print(f'CV Accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}')
    return model, cv_results


def load_model():
    path = os.path.join(MODELS_DIR, 'xgb_model.pkl')
    if not os.path.exists(path):
        raise FileNotFoundError('Model not trained yet. Call /api/train first.')
    return joblib.load(path)


if __name__ == '__main__':
    from data_processor import load_and_process
    X_train, X_test, y_train, y_test, le, scaler, feature_cols = load_and_process()
    model, cv_results = train(X_train, y_train, len(le.classes_))
    print('CV Results:', cv_results)
