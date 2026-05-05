import numpy as np
import json
import os
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report
)

RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')


def evaluate(model, X_test, y_test, le, feature_cols):
    os.makedirs(RESULTS_DIR, exist_ok=True)

    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)

    accuracy = float(accuracy_score(y_test, y_pred))
    precision = float(precision_score(y_test, y_pred, average='weighted', zero_division=0))
    recall = float(recall_score(y_test, y_pred, average='weighted', zero_division=0))
    f1 = float(f1_score(y_test, y_pred, average='weighted', zero_division=0))

    # ROC-AUC: use macro OvR to handle all 9 classes
    try:
        roc_auc = float(roc_auc_score(y_test, y_proba, multi_class='ovr', average='macro'))
    except Exception:
        roc_auc = None

    cm = confusion_matrix(y_test, y_pred).tolist()

    report = classification_report(
        y_test, y_pred, target_names=le.classes_, output_dict=True, zero_division=0
    )
    per_class = {
        cls: {
            'precision': report[cls]['precision'],
            'recall': report[cls]['recall'],
            'f1_score': report[cls]['f1-score'],
            'support': report[cls]['support'],
        }
        for cls in le.classes_
    }

    importances = model.feature_importances_.tolist()
    feature_importance = [
        {'feature': feat, 'importance': float(imp)}
        for feat, imp in sorted(zip(feature_cols, importances), key=lambda x: -x[1])
    ]

    results = {
        'accuracy': accuracy,
        'precision': precision,
        'recall': recall,
        'f1_score': f1,
        'roc_auc': roc_auc,
        'confusion_matrix': cm,
        'class_labels': list(le.classes_),
        'per_class_metrics': per_class,
        'feature_importance': feature_importance,
    }

    with open(os.path.join(RESULTS_DIR, 'evaluation_results.json'), 'w') as f:
        json.dump(results, f, indent=2)

    print(f'Accuracy: {accuracy:.4f} | F1: {f1:.4f} | ROC-AUC: {roc_auc}')
    return results


if __name__ == '__main__':
    from data_processor import load_and_process
    from model_trainer import train, load_model
    X_train, X_test, y_train, y_test, le, scaler, feature_cols = load_and_process()
    model, _ = train(X_train, y_train, len(le.classes_))
    results = evaluate(model, X_test, y_test, le, feature_cols)
    print('Feature importance:', results['feature_importance'])
