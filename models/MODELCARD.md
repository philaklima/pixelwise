# MODELCARD.md: digit_classifier_v2

## Training Data
MNIST digits 0-9, ~63k train / ~7k test, public domain.
Class 0 is now included; v1 withheld it.
Pixel values normalised from [0, 255] to [0, 1], then binarised at 0.5
before training.

## Capabilities
Predict handwritten digits 0-9.
Expected accuracy: ~98% (MLP, 0.9789 on the held-out 7k test split).

## Known Failures
9 is the weakest class (recall 0.968, precision 0.956), with the
residual 6/9 and 3/8 confusions from v1 much reduced. Class 0 is the
strongest (f1 0.991). Messy, rotated, or heavily skewed digits still
fail.

## Intended Use
28x28 canvas drawings, greyscale, pixel values in [0, 255] (uint8) or
[0, 1] (float). Out of scope: photos, non-digit characters, rotated or
heavily skewed inputs.

## Pipeline Contract
The artefact is an `sklearn.pipeline.Pipeline` with two named steps:

- `binarize`: `Binarizer(threshold=0.5)` — idempotent on already-binarised
  {0.0, 1.0} inputs, so callers that pre-binarise at uint8 threshold 128
  pass through unchanged.
- `clf`: `MLPClassifier(hidden_layer_sizes=(256, 128), activation="relu",
  solver="adam")`.

Inputs:
- shape `(N, 784)` (flattened 28x28),
- dtype `float32` or `float64`,
- value range either {0.0, 1.0} (pre-binarised) or [0, 1] (the pipeline
  binarises at 0.5).

`pipeline.classes_` returns `["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]`.
`pipeline.n_features_in_` returns `784`.

## Reproducibility
Trained by `train.py` in this repo with `random_state=42` and a 90/10
stratified split. `early_stopping` is off: scikit-learn 1.8.0 scores the
validation split with `np.isnan` on string predictions and raises, so
Adam stops on the training-loss plateau instead. Rerun:

    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    python train.py

MNIST downloads automatically via `sklearn.datasets.fetch_openml` and
is cached in `~/scikit_learn_data/`.

## Version
v2.0 — adds class 0, swaps the LogisticRegression baseline for an MLP,
~98% test accuracy. The integrating app must update its `CLASSES` list to
the 10-class set and pin `MODEL_VERSION=v2.0`.
