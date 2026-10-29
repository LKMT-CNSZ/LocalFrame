from __future__ import annotations

from types import SimpleNamespace

import pytest

from comfyui_spectrum_h3 import replay_calibration_validation as validation


def _record(step_id: int):
    return SimpleNamespace(
        step_id=step_id,
        stream_name="video",
        blend_weight=0.5,
    )


def test_non_interior_replay_calibration_targets_are_rejected(monkeypatch):
    calls = 0

    def original(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return {"ok": True}

    monkeypatch.setattr(validation, "_ORIGINAL_CALIBRATION_ROW", original)
    with pytest.raises(ValueError, match="requires an interior withheld target"):
        validation._calibration_row_with_interior_guard(
            SimpleNamespace(), _record(0), object(), [0, 2, 4], run_id=1
        )
    with pytest.raises(ValueError, match="requires an interior withheld target"):
        validation._calibration_row_with_interior_guard(
            SimpleNamespace(), _record(4), object(), [0, 2, 4], run_id=1
        )
    assert calls == 0


def test_missing_replay_calibration_target_is_rejected(monkeypatch):
    monkeypatch.setattr(
        validation,
        "_ORIGINAL_CALIBRATION_ROW",
        lambda *_args, **_kwargs: {"unexpected": True},
    )
    with pytest.raises(ValueError, match="is not an anchor"):
        validation._calibration_row_with_interior_guard(
            SimpleNamespace(), _record(3), object(), [0, 2, 4], run_id=1
        )


def test_interior_target_delegates_unchanged(monkeypatch):
    sentinel = {"ok": True}
    observed = {}

    def original(smoother, record, samples, anchor_ids, *, run_id):
        observed.update(
            smoother=smoother,
            record=record,
            samples=samples,
            anchor_ids=anchor_ids,
            run_id=run_id,
        )
        return sentinel

    monkeypatch.setattr(validation, "_ORIGINAL_CALIBRATION_ROW", original)
    smoother = SimpleNamespace()
    record = _record(2)
    samples = object()
    anchor_ids = [0, 2, 4]
    result = validation._calibration_row_with_interior_guard(
        smoother, record, samples, anchor_ids, run_id=7
    )
    assert result is sentinel
    assert observed == {
        "smoother": smoother,
        "record": record,
        "samples": samples,
        "anchor_ids": anchor_ids,
        "run_id": 7,
    }
