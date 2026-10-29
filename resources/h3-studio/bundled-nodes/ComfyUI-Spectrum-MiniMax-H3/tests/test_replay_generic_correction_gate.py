from __future__ import annotations

from dataclasses import asdict
from types import SimpleNamespace

import pytest
import torch

from comfyui_spectrum_h3 import generic_correction as generic_module
from comfyui_spectrum_h3 import replay_generic_correction_gate as gate_module
from comfyui_spectrum_h3.config import SpectrumH3Config
from comfyui_spectrum_h3.experiments import OfflineFeatureArchive, OfflineSmoother
from comfyui_spectrum_h3.model_aware import ModelAwareForecastDecision
from comfyui_spectrum_h3.nodes import SpectrumApplyMiniMaxH3
from comfyui_spectrum_h3.runtime import SpectrumH3Runtime


def _decision(
    *,
    audio_correction: float = -0.20,
    video_correction: float = -0.10,
    audio_blend: float = 0.0,
    video_blend: float = 0.5,
) -> ModelAwareForecastDecision:
    return ModelAwareForecastDecision(
        trajectory_risk=0.2,
        model_risk=0.2,
        patch_risk=0.1,
        combined_risk=0.2,
        confidence=0.8,
        ridge_lambda=0.1,
        degree=1,
        audio_blend_weight=audio_blend,
        video_blend_weight=video_blend,
        audio_correction_gain=audio_correction,
        video_correction_gain=video_correction,
        forecast_horizon=1.0,
        force_actual=False,
    )


def _archive(
    *,
    with_correction: bool = True,
    packed: bool = False,
) -> OfflineFeatureArchive:
    archive = OfflineFeatureArchive(
        total_steps=5,
        sampler_name="sample_er_sde",
        history_storage="system_ram",
    )
    coordinates = torch.linspace(-1.0, 1.0, 5).tolist()
    correction = -0.20 if with_correction else 0.0
    video_correction = -0.10 if with_correction else 0.0
    decision = _decision(
        audio_correction=correction,
        video_correction=(correction if packed else video_correction),
        audio_blend=(0.5 if packed else 0.0),
        video_blend=0.5,
    )
    for step_id, coordinate in enumerate(coordinates):
        actual = step_id % 2 == 0
        archive.record_step(
            step_id,
            coordinate,
            actual,
            model_aware_decision=(None if actual else decision),
        )
    topology = () if packed else (("target_audio_rows", 1), ("target_video_rows", 1))
    values = {
        0: ((0.0, 0.2, -0.1), (0.0, 0.1, 0.3)),
        2: ((1.0, 1.4, 0.8), (1.4, 1.0, 1.6)),
        4: ((3.0, 2.6, 3.2), (2.2, 3.0, 2.7)),
    }
    for step_id in (0, 2, 4):
        feature = torch.tensor([values[step_id]], dtype=torch.float32)
        archive.record_actual(
            step_id,
            coordinates[step_id],
            feature,
            labels=((0, "positive"),),
            topology=topology,
            take_ownership=False,
        )
    assert archive.complete(minimum_anchors=2)
    return archive


def _smoother(
    archive: OfflineFeatureArchive,
    *,
    gate_enabled: bool | None,
    packed: bool = False,
) -> OfflineSmoother:
    if gate_enabled is not None:
        setattr(archive, gate_module._ARCHIVE_GATE_ATTR, gate_enabled)
    return OfflineSmoother(
        archive,
        degree=1,
        ridge_lambda=0.1,
        blend_weight=0.5,
        audio_blend_weight=(0.5 if packed else 0.0),
    )


def _weights(smoother: OfflineSmoother) -> dict[tuple[int, int, int], torch.Tensor]:
    return {key: value.clone() for key, value in smoother._forecast_weights.items()}


def _assert_weights_equal(left, right) -> None:
    assert left.keys() == right.keys()
    for key in left:
        assert torch.equal(left[key], right[key]), key


def _counted_first_pass(gate_enabled: bool) -> dict[str, object]:
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            degree=1,
            max_history=6,
            warmup_steps=2,
            tail_actual_steps=1,
            bootstrap_first_forecast=False,
            model_aware_mode="full",
            model_aware_risk_threshold=1.0,
            model_aware_replay_generic_correction=gate_enabled,
            offline_smoothing_replay=True,
            audio_blend_weight=0.0,
            blend_weight=0.5,
        )
    )
    sigmas = torch.tensor([1.0, 0.82, 0.64, 0.46, 0.28, 0.10, 0.0])
    topology = (("target_audio_rows", 1), ("target_video_rows", 1))
    labels = ("branch",)
    runtime.begin_offline_capture(total_steps=6, sampler_name="sample_er_sde")
    run_id = runtime.start_run(
        sigmas,
        "sample_er_sde",
        supported_sampler=True,
        max_consecutive_forecasts=1,
        min_actual_steps_after_forecast=1,
        min_tail_actual_steps=0,
    )
    decisions: list[bool] = []
    reasons: list[str] = []
    try:
        for step_id, sigma in enumerate(sigmas[:-1]):
            decision = runtime.begin_step(sigma)
            decisions.append(bool(decision["actual"]))
            reasons.append(str(decision["reason"]))
            call_id, actual = runtime.begin_model_call(
                decision["run_id"],
                decision["step_id"],
                topology=topology,
                labels=labels,
                expected_shape=(1, 2, 2),
            )
            if actual:
                base = float(step_id + 1)
                runtime.observe_actual(
                    decision["run_id"],
                    decision["step_id"],
                    call_id,
                    torch.tensor(
                        [[[base, base + 0.25], [1.5 * base, 1.5 * base + 0.5]]],
                        dtype=torch.float32,
                    ),
                )
            else:
                prediction = runtime.predict(
                    decision["run_id"],
                    decision["step_id"],
                    call_id,
                    device=torch.device("cpu"),
                    dtype=torch.float32,
                )
                assert prediction is not None
            runtime.finalize_step(decision["run_id"], decision["step_id"])
        actual_calls = runtime.stats.actual_transformer_calls
        fallback_count = runtime.stats.forecast_fallbacks
    finally:
        runtime.end_run(run_id)
    assert runtime.complete_offline_capture()
    archive = runtime.offline_archive
    assert archive is not None
    telemetry = getattr(archive, gate_module._ARCHIVE_TELEMETRY_ATTR)
    result = {
        "decisions": tuple(decisions),
        "reasons": tuple(reasons),
        "actual_calls": actual_calls,
        "fallbacks": fallback_count,
        "telemetry": telemetry,
    }
    runtime.release_offline_archive()
    return result


def test_replay_generic_correction_default_is_false_in_config_node_and_runtime():
    config = SpectrumH3Config(model_aware_mode="full")
    assert config.model_aware_replay_generic_correction is False
    assert SpectrumH3Config(**asdict(config)) == config
    with pytest.raises(TypeError, match="model_aware_replay_generic_correction"):
        SpectrumH3Config(model_aware_replay_generic_correction="no")

    optional = SpectrumApplyMiniMaxH3.INPUT_TYPES()["optional"]
    assert optional["model_aware_replay_generic_correction"][1]["default"] is False

    runtime = SpectrumH3Runtime(config)
    runtime.begin_offline_capture(total_steps=2, sampler_name="sample_er_sde")
    archive = runtime.offline_archive
    assert archive is not None
    assert getattr(archive, gate_module._ARCHIVE_GATE_ATTR) is False
    runtime.release_offline_archive()


def test_unstamped_hand_constructed_archive_retains_pre_gate_legacy_semantics():
    unstamped = _smoother(_archive(with_correction=True), gate_enabled=None)
    explicit_legacy = _smoother(_archive(with_correction=True), gate_enabled=True)
    _assert_weights_equal(_weights(unstamped), _weights(explicit_legacy))
    telemetry = getattr(unstamped.archive, gate_module._ARCHIVE_TELEMETRY_ATTR)
    assert telemetry.enabled is True
    assert telemetry.path == "current_causal_gain_transfer"


def test_explicit_false_equals_uncorrected_b_and_explicit_true_restores_legacy_d():
    disabled = _smoother(_archive(with_correction=True), gate_enabled=False)
    uncorrected = _smoother(_archive(with_correction=False), gate_enabled=True)
    legacy = _smoother(_archive(with_correction=True), gate_enabled=True)

    _assert_weights_equal(_weights(disabled), _weights(uncorrected))
    assert any(
        not torch.equal(disabled._forecast_weights[key], legacy._forecast_weights[key])
        for key in disabled._forecast_weights
    )

    disabled_telemetry = getattr(
        disabled.archive, gate_module._ARCHIVE_TELEMETRY_ATTR
    )
    assert disabled_telemetry.enabled is False
    assert disabled_telemetry.path == "disabled_replay_geometry_experiment"
    assert disabled_telemetry.applications == 0
    assert disabled_telemetry.skips == 4
    assert disabled_telemetry.extra_transformer_nfe == 0
    assert disabled.model_aware_offline_correction_applications == 0

    legacy_telemetry = getattr(legacy.archive, gate_module._ARCHIVE_TELEMETRY_ATTR)
    assert legacy_telemetry.enabled is True
    assert legacy_telemetry.path == "current_causal_gain_transfer"
    assert legacy_telemetry.applications == 4
    assert legacy_telemetry.skips == 0
    assert legacy.model_aware_offline_correction_applications == 4


def test_disabled_gate_preserves_original_archive_and_exact_anchors():
    archive = _archive(with_correction=True)
    original_steps = archive.steps
    original_decisions = tuple(record.model_aware_decision for record in archive.steps)
    disabled = _smoother(archive, gate_enabled=False)
    assert archive.steps is original_steps
    assert tuple(record.model_aware_decision for record in archive.steps) == original_decisions

    kwargs = {"rows": (0,), "device": torch.device("cpu"), "dtype": torch.float32}
    for step_id in (0, 2, 4):
        expected = next(anchor.feature for anchor in archive.anchors if anchor.step_id == step_id)
        torch.testing.assert_close(disabled.predict(step_id, **kwargs), expected)


def test_replay_gate_does_not_change_causal_pr39_generic_correction_segments():
    call = SimpleNamespace(
        topology=(("target_audio_rows", 1), ("target_video_rows", 1)),
        expected_shape=(1, 2, 2),
    )
    decision = _decision()

    def build(gate_enabled: bool):
        runtime = SpectrumH3Runtime(
            SpectrumH3Config(
                model_aware_mode="full",
                offline_smoothing_replay=False,
                model_aware_replay_generic_correction=gate_enabled,
            )
        )
        runtime.forecaster.update(
            -1.0,
            torch.tensor([[[0.0, 0.2], [1.0, 1.2]]]),
            anchor_id=0,
            take_ownership=False,
        )
        runtime.forecaster.update(
            -0.4,
            torch.tensor([[[0.8, 1.0], [1.8, 2.0]]]),
            anchor_id=1,
            take_ownership=False,
        )
        return generic_module._weight_segments(
            runtime,
            call,
            decision,
            coordinate=0.2,
        )

    enabled = build(True)
    disabled = build(False)
    assert len(enabled) == len(disabled) == 2
    for enabled_segment, disabled_segment in zip(enabled, disabled, strict=True):
        assert enabled_segment[:2] == disabled_segment[:2]
        assert torch.equal(enabled_segment[2], disabled_segment[2])


def test_first_pass_schedule_nfe_and_er_sde_tail_are_gate_independent():
    enabled = _counted_first_pass(True)
    disabled = _counted_first_pass(False)
    assert enabled["decisions"] == disabled["decisions"]
    assert enabled["reasons"] == disabled["reasons"]
    assert enabled["actual_calls"] == disabled["actual_calls"]
    assert enabled["fallbacks"] == disabled["fallbacks"] == 0
    assert enabled["decisions"][-2:] == (True, True)
    assert enabled["actual_calls"] == sum(enabled["decisions"])
    assert enabled["telemetry"].extra_transformer_nfe == 0
    assert disabled["telemetry"].extra_transformer_nfe == 0


def test_packed_topology_disabled_gate_matches_uncorrected_replay():
    disabled = _smoother(
        _archive(with_correction=True, packed=True),
        gate_enabled=False,
        packed=True,
    )
    uncorrected = _smoother(
        _archive(with_correction=False, packed=True),
        gate_enabled=True,
        packed=True,
    )
    _assert_weights_equal(_weights(disabled), _weights(uncorrected))
    telemetry = getattr(disabled.archive, gate_module._ARCHIVE_TELEMETRY_ATTR)
    assert telemetry.applications == 0
    assert telemetry.skips == 2


def test_non_full_mode_keeps_gate_inert_and_trust_toggle_does_not_control_it():
    non_full = SpectrumH3Runtime(
        SpectrumH3Config(
            model_aware_mode="schedule_confidence",
            model_aware_replay_generic_correction=False,
        )
    )
    non_full.begin_offline_capture(total_steps=2, sampler_name="sample_euler")
    assert non_full.offline_archive is not None
    assert getattr(non_full.offline_archive, gate_module._ARCHIVE_GATE_ATTR) is True
    non_full.release_offline_archive()

    for trust_enabled in (False, True):
        runtime = SpectrumH3Runtime(
            SpectrumH3Config(
                model_aware_mode="full",
                model_aware_trust_shrinkage=trust_enabled,
                model_aware_replay_generic_correction=True,
            )
        )
        runtime.begin_offline_capture(total_steps=2, sampler_name="sample_er_sde")
        assert runtime.offline_archive is not None
        assert getattr(runtime.offline_archive, gate_module._ARCHIVE_GATE_ATTR) is True
        runtime.release_offline_archive()


def test_gate_restores_archive_steps_on_ordinary_failure_and_cuda_oom(monkeypatch):
    archive = _archive(with_correction=True)
    smoother = _smoother(archive, gate_enabled=True)
    setattr(archive, gate_module._ARCHIVE_GATE_ATTR, False)
    original_steps = archive.steps

    def ordinary_failure(_smoother):
        assert _smoother.archive.steps is not original_steps
        raise ValueError("ordinary replay failure")

    monkeypatch.setattr(
        gate_module,
        "_ORIGINAL_OFFLINE_BUILD_FORECAST_WEIGHTS",
        ordinary_failure,
    )
    with pytest.raises(ValueError, match="ordinary replay failure"):
        gate_module._build_forecast_weights_with_replay_generic_gate(smoother)
    assert archive.steps is original_steps

    def oom_failure(_smoother):
        assert _smoother.archive.steps is not original_steps
        raise torch.cuda.OutOfMemoryError("synthetic OOM")

    monkeypatch.setattr(
        gate_module,
        "_ORIGINAL_OFFLINE_BUILD_FORECAST_WEIGHTS",
        oom_failure,
    )
    with pytest.raises(torch.cuda.OutOfMemoryError, match="synthetic OOM"):
        gate_module._build_forecast_weights_with_replay_generic_gate(smoother)
    assert archive.steps is original_steps
