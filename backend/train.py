"""
Developer script — run once to train and save the model.
Usage: python3 train.py
"""
from data_processor import load_and_process
from model_trainer import train
from evaluator import evaluate

print("Loading and processing data...")
X_train, X_test, y_train, y_test, le, scaler, feature_cols = load_and_process()

print("Training model (this takes 2-3 minutes)...")
model, cv_results = train(X_train, y_train, len(le.classes_))

print("Evaluating...")
results = evaluate(model, X_test, y_test, le, feature_cols)

print("\n=== Results ===")
print(f"Accuracy : {results['accuracy']*100:.2f}%")
print(f"F1 Score : {results['f1_score']*100:.2f}%")
print(f"ROC-AUC  : {results['roc_auc']*100:.2f}%")
print(f"CV Mean  : {cv_results['cv_mean']*100:.2f}% ± {cv_results['cv_std']*100:.2f}%")
print("\nModel saved to models/  — you can now start the Flask server.")
