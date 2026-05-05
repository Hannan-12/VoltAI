import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
import joblib
import os

DATA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'PZEM_Data_-_Data__2_.csv')
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')


def load_and_process(data_path=DATA_PATH):
    df = pd.read_csv(data_path)

    # Drop time column — not a predictive feature
    df = df.drop(columns=['Time'])

    # Engineer 3 extra features
    df['apparent_power'] = df['Voltage'] * df['Current']
    df['reactive_power'] = np.sqrt(
        np.maximum(df['apparent_power'] ** 2 - df['Power'] ** 2, 0)
    )
    df['power_factor_deviation'] = (df['Power Factor'] - df['Power Factor'].mean()).abs()

    feature_cols = [
        'Voltage', 'Current', 'Power', 'Energy', 'Frequency', 'Power Factor',
        'apparent_power', 'reactive_power', 'power_factor_deviation'
    ]

    X = df[feature_cols].values
    y = df['Load_Label'].values

    le = LabelEncoder()
    y_encoded = le.fit_transform(y)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
    )

    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(le, os.path.join(MODELS_DIR, 'label_encoder.pkl'))
    joblib.dump(scaler, os.path.join(MODELS_DIR, 'scaler.pkl'))
    joblib.dump(feature_cols, os.path.join(MODELS_DIR, 'feature_cols.pkl'))

    return X_train, X_test, y_train, y_test, le, scaler, feature_cols


if __name__ == '__main__':
    X_train, X_test, y_train, y_test, le, scaler, feature_cols = load_and_process()
    print(f'Train: {X_train.shape}, Test: {X_test.shape}')
    print(f'Classes: {list(le.classes_)}')
    print(f'Features: {feature_cols}')
