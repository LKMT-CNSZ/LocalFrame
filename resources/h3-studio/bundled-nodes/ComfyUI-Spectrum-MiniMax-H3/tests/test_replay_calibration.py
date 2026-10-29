from __future__ import annotations

import json
from dataclasses import asdict
from types import SimpleNamespace

import pytest
import torch

from comfyui_spectrum_h3 import replay_calibration as calibration
from comfyui_spectrum_h3 import trust_probe as trust
from comfyui_spectrum_h3.config import SpectrumH3Config
from comfyui_spectrum_h3.experiments import OfflineFeatureArchive, OfflineSmoother
from comfyui_spectrum_h3.runtime import SpectrumH3Runtime


def _archive() -> OfflineFeatureArchive:
    archive = OfflineFeatureArchive(
        total_steps=5,
        sampler_name="sample_er_sde",
        history_storage="system_ram",
    )
    coordinates = (-1.0, -0.5, 0.0, 0.5, 1.0)
    for step_id, coordinate in enumerate(coordinates):
        archive.record_step(step_id, coordinate, step_id % 2 == 0)
    topology = (
        ("video_shape", (1, 24, 57, 60, 44)),
        ("audio_shape", (1, 8, 100)),
        ("text_length", 922),
        ("hidden_width", 64),
        ("target_audio_rows", 1),
        ("target_video_rows", 1),
        ("patch_size", (1, 2, 2)),
        ("sigma_shifts", (12.0, 3.0)),
        ("adaln_curves", True),
    )
    values = {
        0: torch.tensor([[[0.0, 0.1, 0.2], [0.5, 0.6, 0.7]]]),
        2: torch.tensor([[[1.0, 1.3, 0.8], [1.7, 1.1, 1.9]]]),
        4: torch.tensor([[[2.4, 1.8, 2.7], [2.8, 3.1, 2.5]]]),
    }
    for step_id in (0, 2, 4):
        archive.record_actual(
            step_id,
            coordinates[step_id],
            values[step_id],
            labels=("branch",),
            topology=topology,
            take_ownership=False,
        )
    assert archive.complete(minimum_anchors=2)
    return archive


def _record(stream_name: str = "video") -> trust._ReplayShadowRecord:
    return trust._ReplayShadowRecord(
        step_id=2,
        coordinate=0.0,
        latest_anchor_id=0,
        stream_name=stream_name,
        degree=1,
        ridge_lambda=0.1,
        blend_weight=0.5 if stream_name == "video" else 0.0,
        correction_gain=-0.1,
        disagreement=0.42,
        kappa=0.25,
    )


def _row() -> tuple[dict[str, object], OfflineFeatureArchive, OfflineSmoother]:
    archive = _archive()
    smoother = OfflineSmoother(
        archive,
        degree=1,
        ridge_lambda=0.1,
        blend_weight=0.5,
        audio_blend_weight=0.0,
    )
    samples = trust._sample_archive_stream(smoother, 1, 2)
    row = calibration._calibration_row(
        smoother,
        _record(),
        samples,
        list(smoother._anchor_ids),
        run_id=7,
    )
    assert row is not None
    return row, archive, smoother


def test_quadratic_moment_sign_and_endpoint_oracle_parity():
    row, _, _ = _row()
    assert row["run_id"] == 7
    assert row["target_step_id"] == 2
    assert row["left_anchor_step_id"] == 0
    assert row["right_anchor_step_id"] == 4
    assert row["scoring_sample_count"] > 0

    assert calibration.ratio_from_moments(row, 0.0) == pytest.approx(
        row["local_ratio"], abs=calibration._PARITY_TOLERANCE
    )
    assert calibration.ratio_from_moments(row, 1.0) == pytest.approx(
        row["full_spectral_ratio"], abs=calibration._PARITY_TOLERANCE
    )
    assert calibration.ratio_from_moments(row, row["current_weight"]) == pytest.approx(
        row["current_ratio"], abs=calibration._PARITY_TOLERANCE
    )
    oracle = calibration.oracle_weight_from_moments(row)
    assert oracle == pytest.approx(row["oracle_weight"], abs=calibration._PARITY_TOLERANCE)
    assert calibration.ratio_from_moments(row, oracle) == pytest.approx(
        row["oracle_ratio"], abs=calibration._PARITY_TOLERANCE
    )
    assert row["max_parity_abs_error"] <= calibration._PARITY_TOLERANCE
    assert row["row_compatible"] is True


def test_quadratic_formula_clips_weights_and_handles_degenerate_direction():
    row = {
        "local_error_sq_mean": 4.0,
        "local_error_dot_spectral_delta_mean": 0.0,
        "spectral_delta_sq_mean": 0.0,
        "ratio_denominator_rms": 2.0,
        "ratio_epsilon": 1e-6,
    }
    assert calibration.oracle_weight_from_moments(row) == 0.0
    assert calibration.ratio_from_moments(row, -10.0) == pytest.approx(1.0)
    assert calibration.ratio_from_moments(row, 10.0) == pytest.approx(1.0)


def test_predictor_boundary_does_not_use_withheld_target():
    archive = _archive()
    smoother = OfflineSmoother(
        archive,
        degree=1,
        ridge_lambda=0.1,
        blend_weight=0.5,
        audio_blend_weight=0.0,
    )
    samples_a = trust._sample_archive_stream(smoother, 1, 2)
    samples_b = samples_a.clone()
    samples_b[1] = samples_b[1] * 7.0 + 3.0
    row_a = calibration._calibration_row(
        smoother, _record(), samples_a, list(smoother._anchor_ids), run_id=1
    )
    row_b = calibration._calibration_row(
        smoother, _record(), samples_b, list(smoother._anchor_ids), run_id=1
    )
    assert row_a is not None and row_b is not None
    for key in (
        "current_weight",
        "causal_disagreement",
        "validation_penalty",
        "spectral_gap",
        "coordinate",
        "left_anchor_step_id",
        "right_anchor_step_id",
        "bracket_coordinate_spacing",
        "bracket_fraction",
    ):
        if isinstance(row_a[key], float):
            assert row_a[key] == pytest.approx(row_b[key])
        else:
            assert row_a[key] == row_b[key]
    # Mutating only the withheld target changes post-target scoring state while
    # the complete deployable predictor snapshot above remains unchanged.
    assert row_a["local_error_sq_mean"] != pytest.approx(row_b["local_error_sq_mean"])
    assert row_a["local_ratio"] != pytest.approx(row_b["local_ratio"])


def test_calibration_is_video_only():
    archive = _archive()
    smoother = OfflineSmoother(
        archive,
        degree=1,
        ridge_lambda=0.1,
        blend_weight=0.5,
        audio_blend_weight=0.0,
    )
    samples = trust._sample_archive_stream(smoother, 0, 1)
    assert calibration._calibration_row(
        smoother,
        _record("audio"),
        samples,
        list(smoother._anchor_ids),
        run_id=1,
    ) is None


def test_block_schema_provenance_fingerprint_and_payload_are_deterministic(monkeypatch):
    row, archive, smoother = _row()
    config = SpectrumH3Config(
        debug=True,
        model_aware_mode="full",
        offline_smoothing_replay=True,
        model_aware_replay_generic_correction=False,
    )
    runtime = SpectrumH3Runtime(config)
    runtime._offline_archive = archive
    runtime._offline_smoother = smoother
    state = calibration._CalibrationState(
        enabled=True,
        config_snapshot=asdict(config),
        run_id=7,
        rows=[row],
        validated=True,
    )
    setattr(archive, calibration._ARCHIVE_STATE_ATTR, state)
    monkeypatch.delenv("SPECTRUM_H3_SOURCE_REVISION", raising=False)

    first = calibration._build_block(runtime, state)
    second = calibration._build_block(runtime, state)
    assert first == second
    assert first["schema_version"] == calibration._SCHEMA_VERSION
    assert first["kind"] == "spectrum_h3_replay_calibration"
    assert first["provenance"]["seed"] is None
    assert first["provenance"]["source_revision"] is None
    assert len(first["provenance"]["config_hash"]) == 64
    assert len(first["provenance"]["topology_fingerprint"]) == 64
    assert len(first["provenance"]["trace_fingerprint"]) == 64
    assert first["metadata"]["video_shape"] == "1x24x57x60x44"
    assert first["metadata"]["target_video_rows"] == 1
    assert first["metadata"]["text_length"] == 922
    assert first["metadata"]["compatible"] is True
    exported_row = first["target_rows"][0]
    assert exported_row["trace_fingerprint"] == first["provenance"]["trace_fingerprint"]
    assert all(
        value is None or isinstance(value, (bool, int, float, str))
        for value in exported_row.values()
    )
    payload = calibration._canonical_json(first)
    assert len(payload.encode("utf-8")) < calibration._MAX_SERIALIZED_BYTES
    assert json.loads(payload) == first


def test_debug_export_is_one_compact_block(monkeypatch):
    row, archive, smoother = _row()
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            debug=True,
            model_aware_mode="full",
            offline_smoothing_replay=True,
        )
    )
    runtime._offline_archive = archive
    runtime._offline_smoother = smoother
    runtime._offline_phase = "first_pass"
    state = calibration._CalibrationState(
        enabled=True,
        config_snapshot=asdict(runtime.config),
        run_id=1,
        rows=[row],
        validated=True,
    )
    setattr(archive, calibration._ARCHIVE_STATE_ATTR, state)
    monkeypatch.setattr(calibration, "_ORIGINAL_RUNTIME_DEBUG_SUMMARY", lambda _runtime: "base")
    first = calibration._debug_summary_with_calibration(runtime)
    second = calibration._debug_summary_with_calibration(runtime)
    assert first.count(calibration._LOG_PREFIX) == 1
    assert "replay_calibration_rows=1" in first
    assert calibration._LOG_PREFIX not in second


def test_calibration_state_resets_per_capture_and_is_debug_gated():
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            debug=True,
            model_aware_mode="full",
            offline_smoothing_replay=True,
        )
    )
    runtime.begin_offline_capture(total_steps=2, sampler_name="sample_er_sde")
    first_archive = runtime.offline_archive
    assert first_archive is not None
    first_state = getattr(first_archive, calibration._ARCHIVE_STATE_ATTR)
    assert first_state.enabled is True
    runtime.begin_offline_capture(total_steps=2, sampler_name="sample_er_sde")
    second_archive = runtime.offline_archive
    assert second_archive is not None and second_archive is not first_archive
    second_state = getattr(second_archive, calibration._ARCHIVE_STATE_ATTR)
    assert second_state is not first_state

    quiet = SpectrumH3Runtime(
        SpectrumH3Config(
            debug=False,
            model_aware_mode="full",
            offline_smoothing_replay=True,
        )
    )
    quiet.begin_offline_capture(total_steps=2, sampler_name="sample_er_sde")
    assert quiet.offline_archive is not None
    assert getattr(quiet.offline_archive, calibration._ARCHIVE_STATE_ATTR).enabled is False


def test_calibration_failure_is_isolated_but_cuda_oom_propagates(monkeypatch):
    archive = _archive()
    state = calibration._CalibrationState(
        enabled=True,
        config_snapshot=asdict(SpectrumH3Config()),
    )
    setattr(archive, calibration._ARCHIVE_STATE_ATTR, state)
    smoother = SimpleNamespace(
        archive=archive,
        _stream_ranges=(("video", 1, 2),),
        _anchor_ids=(0, 2, 4),
    )
    aggregate = trust._TrustAggregate()

    monkeypatch.setattr(
        trust,
        "_sample_archive_stream",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("diagnostic")),
    )
    calibration._validate_calibration(smoother, aggregate)
    assert state.failures == 1
    assert state.validated is True

    state.validated = False
    monkeypatch.setattr(
        trust,
        "_sample_archive_stream",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            torch.cuda.OutOfMemoryError("oom")
        ),
    )
    with pytest.raises(torch.cuda.OutOfMemoryError):
        calibration._validate_calibration(smoother, aggregate)
