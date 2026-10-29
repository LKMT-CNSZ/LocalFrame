from __future__ import annotations

import math
from types import SimpleNamespace

import pytest
import torch

import comfyui_spectrum_h3.replay_trust_shadow as replay_module
from comfyui_spectrum_h3 import trust_probe as trust_module
from comfyui_spectrum_h3.config import SpectrumH3Config
from comfyui_spectrum_h3.experiments import OfflineFeatureArchive, OfflineSmoother
from comfyui_spectrum_h3.model_aware import ModelForecastabilityProfile, ProfileLookup
from comfyui_spectrum_h3.runtime import SpectrumH3Runtime
from comfyui_spectrum_h3.trust_probe import (
    apply_trust_to_history_weights,
    oracle_segment_kappa,
    trust_kappa,
)


def _profile_lookup() -> ProfileLookup:
    return ProfileLookup(
        profile=ModelForecastabilityProfile(
            cache_key=("base", "patches"),
            base_model_identity="fake:base",
            patch_identity="patches",
            active_patch_count=0,
            active_patch_keys=0,
            recognized_lora_count=0,
            unknown_patch_count=0,
            sampled_base_tensors=8,
            profile_confidence=1.0,
            aggregate_sensitivity=0.2,
            patch_perturbation=0.0,
            final_block_perturbation=0.0,
            audio_sensitivity=0.8,
            video_sensitivity=1.2,
            audio_head_weight=None,
            video_head_weight=None,
            audio_head_gram_diagonal=None,
            video_head_gram_diagonal=None,
            forecast_risk_prior=0.2,
            build_seconds=0.001,
            estimated_bytes=1024,
            transient_workspace_bytes=4096,
        ),
        cache_hit=True,
        lookup_seconds=0.0,
    )


def _archive(*, packed: bool = False) -> OfflineFeatureArchive:
    archive = OfflineFeatureArchive(
        total_steps=4,
        sampler_name="sample_er_sde",
        history_storage="system_ram",
    )
    labels = ("branch",)
    topology = () if packed else (("target_audio_rows", 1), ("target_video_rows", 1))
    features = {
        0: torch.tensor([[[0.0, 0.2], [1.0, 1.2]]]),
        2: torch.tensor([[[0.8, 1.0], [1.8, 2.0]]]),
        3: torch.tensor([[[1.2, 1.4], [2.2, 2.4]]]),
    }
    coordinates = {0: -1.0, 1: -0.6, 2: 0.2, 3: 1.0}
    for step_id in range(4):
        actual = step_id in features
        if actual:
            archive.record_actual(
                step_id,
                coordinates[step_id],
                features[step_id],
                labels=labels,
                topology=topology,
                take_ownership=False,
            )
        archive.record_step(step_id, coordinates[step_id], actual)
    assert archive.complete(minimum_anchors=2)
    return archive


def _shadow_archive(*, packed: bool = False) -> OfflineFeatureArchive:
    archive = OfflineFeatureArchive(
        total_steps=9,
        sampler_name="sample_er_sde",
        history_storage="system_ram",
    )
    labels = ("branch",)
    topology = () if packed else (("target_audio_rows", 1), ("target_video_rows", 1))
    coordinates = {step: -1.0 + 0.25 * step for step in range(9)}
    features = {
        0: torch.tensor([[[0.0, 0.1, 0.2], [1.0, 1.1, 1.2]]]),
        2: torch.tensor([[[1.0, 1.4, 0.9], [2.0, 2.5, 1.8]]]),
        4: torch.tensor([[[1.4, 2.0, 1.2], [2.8, 3.2, 2.4]]]),
        6: torch.tensor([[[3.0, 2.4, 3.4], [4.5, 3.8, 4.2]]]),
        8: torch.tensor([[[4.0, 5.0, 4.5], [6.0, 6.8, 5.5]]]),
    }
    for step_id in range(9):
        actual = step_id in features
        if actual:
            archive.record_actual(
                step_id,
                coordinates[step_id],
                features[step_id],
                labels=labels,
                topology=topology,
                take_ownership=False,
            )
        archive.record_step(step_id, coordinates[step_id], actual)
    assert archive.complete(minimum_anchors=2)
    return archive


def _attach_trust(
    archive: OfflineFeatureArchive,
    *,
    audio_kappa: float,
    video_kappa: float,
) -> trust_module._TrustAggregate:
    aggregate = trust_module._TrustAggregate()
    archive._model_aware_trust_aggregate = aggregate
    archive._model_aware_trust_forecasts = {
        1: trust_module._ForecastTrustDecision(
            step_id=1,
            horizon=1.0,
            latest_anchor_id=0,
            audio=trust_module._StreamTrustDecision(
                disagreement=0.7,
                kappa=audio_kappa,
            ),
            video=trust_module._StreamTrustDecision(
                disagreement=0.3,
                kappa=video_kappa,
            ),
            compute_seconds=0.0,
            scalar_transfer_seconds=0.0,
        )
    }
    return aggregate


def _attach_replay_shadow_records(
    archive: OfflineFeatureArchive,
) -> trust_module._TrustAggregate:
    aggregate = getattr(archive, "_model_aware_trust_aggregate", None)
    if not isinstance(aggregate, trust_module._TrustAggregate):
        aggregate = trust_module._TrustAggregate()
        archive._model_aware_trust_aggregate = aggregate
    records: list[trust_module._ReplayShadowRecord] = []
    for index, step_id in enumerate((2, 4, 6)):
        latest_anchor_id = step_id - 2
        causal_disagreement = (0.20, 0.50, 0.80)[index]
        for stream_name, blend in (("audio", 0.0), ("video", 0.5)):
            records.append(
                trust_module._ReplayShadowRecord(
                    step_id=step_id,
                    coordinate=-1.0 + 0.25 * step_id,
                    latest_anchor_id=latest_anchor_id,
                    stream_name=stream_name,
                    degree=1,
                    ridge_lambda=0.1,
                    blend_weight=blend,
                    correction_gain=0.0,
                    disagreement=causal_disagreement,
                    kappa=trust_kappa(
                        causal_disagreement,
                        1.0,
                        theta=0.15,
                    ),
                )
            )
    archive._model_aware_trust_replay_shadow_records = records
    return aggregate


def _build_smoother(archive: OfflineFeatureArchive) -> OfflineSmoother:
    packed = not bool(archive.topology)
    return OfflineSmoother(
        archive,
        degree=1,
        ridge_lambda=0.1,
        blend_weight=0.5,
        audio_blend_weight=0.5 if packed else 0.0,
    )


def _counted_er_sde_first_pass(trust_enabled: bool) -> dict[str, object]:
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            degree=1,
            max_history=6,
            warmup_steps=2,
            tail_actual_steps=1,
            bootstrap_first_forecast=False,
            model_aware_mode="full",
            model_aware_risk_threshold=1.0,
            model_aware_trust_shrinkage=trust_enabled,
            offline_smoothing_replay=True,
            audio_blend_weight=0.0,
            blend_weight=0.5,
        )
    )
    runtime.set_model_profile(_profile_lookup())
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
                feature = torch.tensor(
                    [[[base, base + 0.25], [1.5 * base, 1.5 * base + 0.5]]],
                    dtype=torch.float32,
                )
                runtime.observe_actual(
                    decision["run_id"],
                    decision["step_id"],
                    call_id,
                    feature,
                )
            else:
                predicted = runtime.predict(
                    decision["run_id"],
                    decision["step_id"],
                    call_id,
                    device=torch.device("cpu"),
                    dtype=torch.float32,
                )
                assert predicted is not None
            runtime.finalize_step(decision["run_id"], decision["step_id"])
        actual_calls = runtime.stats.actual_transformer_calls
        fallbacks = runtime.stats.forecast_fallbacks
    finally:
        runtime.end_run(run_id)

    assert runtime.complete_offline_capture()
    archive = runtime.offline_archive
    aggregate = getattr(archive, "_model_aware_trust_aggregate", None)
    result = {
        "decisions": tuple(decisions),
        "reasons": tuple(reasons),
        "actual_calls": actual_calls,
        "fallbacks": fallbacks,
        "applications": (
            aggregate.applications
            if isinstance(aggregate, trust_module._TrustAggregate)
            else 0
        ),
        "failures": (
            aggregate.failures
            if isinstance(aggregate, trust_module._TrustAggregate)
            else 0
        ),
        "shadow_only": bool(
            getattr(archive, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, False)
        ),
    }
    runtime.release_offline_archive()
    return result


def test_trust_kappa_decreases_with_disagreement_and_horizon():
    low_risk = trust_kappa(0.05, 1.0, theta=0.25)
    high_risk = trust_kappa(0.50, 1.0, theta=0.25)
    long_horizon = trust_kappa(0.05, 3.0, theta=0.25)
    assert 0.0 < high_risk < low_risk < 1.0
    assert 0.0 < long_horizon < low_risk


@pytest.mark.parametrize("risk", [0.0, 0.15, 1.0, 100.0])
@pytest.mark.parametrize("horizon", [1.0, 2.0, 10.0])
def test_trust_kappa_is_finite_and_bounded(risk, horizon):
    result = trust_kappa(risk, horizon, theta=0.15)
    assert math.isfinite(result)
    assert 0.0 <= result <= 1.0


def test_oracle_segment_kappa_endpoint_and_clamp_cases():
    latest = torch.tensor([0.0, 0.0])
    proposal = torch.tensor([2.0, 0.0])
    assert float(oracle_segment_kappa(torch.tensor([1.0, 0.0]), latest, proposal)) == pytest.approx(0.5)
    assert float(oracle_segment_kappa(proposal, latest, proposal)) == pytest.approx(1.0)
    assert float(oracle_segment_kappa(torch.tensor([3.0, 0.0]), latest, proposal)) == pytest.approx(1.0)
    assert float(oracle_segment_kappa(torch.tensor([-2.0, 0.0]), latest, proposal)) == pytest.approx(0.0)


def test_history_weight_trust_endpoints_and_affine_invariant():
    baseline = torch.tensor([-0.2, 0.3, 0.9], dtype=torch.float32)
    unchanged = apply_trust_to_history_weights(baseline, 1.0, 2)
    held = apply_trust_to_history_weights(baseline, 0.0, 2)
    halfway = apply_trust_to_history_weights(baseline, 0.5, 2)
    assert torch.equal(unchanged, baseline)
    assert torch.equal(held, torch.tensor([0.0, 0.0, 1.0]))
    assert torch.allclose(halfway, torch.tensor([-0.1, 0.15, 0.95]))
    assert float(halfway.sum()) == pytest.approx(float(baseline.sum()))


def test_default_config_disables_applied_trust_and_rejects_invalid_mode():
    assert SpectrumH3Config().model_aware_trust_shrinkage is False
    with pytest.raises(TypeError, match="model_aware_trust_shrinkage"):
        SpectrumH3Config(model_aware_trust_shrinkage="yes")
    with pytest.raises(ValueError, match="requires model_aware_mode='full'"):
        SpectrumH3Config(
            model_aware_mode="schedule",
            model_aware_trust_shrinkage=True,
        ).validate()


def test_single_pass_causal_trust_application_is_unchanged(monkeypatch):
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            model_aware_mode="full",
            model_aware_trust_shrinkage=True,
        )
    )
    runtime._run = SimpleNamespace(run_id=1)
    runtime._step = SimpleNamespace(step_id=2)
    runtime.forecaster.update(
        -1.0,
        torch.tensor([[[0.0], [1.0]]]),
        anchor_id=0,
        take_ownership=False,
    )
    runtime.forecaster.update(
        -0.5,
        torch.tensor([[[0.5], [1.5]]]),
        anchor_id=1,
        take_ownership=False,
    )
    call = SimpleNamespace(
        topology=(("target_audio_rows", 1), ("target_video_rows", 1)),
        expected_shape=(1, 2, 1),
    )
    baseline_audio = torch.tensor([0.25, 0.75])
    baseline_video = torch.tensor([0.40, 0.60])

    def base_segments(*_args, **_kwargs):
        return (
            (0, 1, baseline_audio.clone()),
            (1, 2, baseline_video.clone()),
        )

    trust = trust_module._ForecastTrustDecision(
        step_id=2,
        horizon=1.0,
        latest_anchor_id=1,
        audio=trust_module._StreamTrustDecision(disagreement=1.0, kappa=0.0),
        video=trust_module._StreamTrustDecision(disagreement=0.0, kappa=1.0),
        compute_seconds=0.0,
        scalar_transfer_seconds=0.0,
    )
    monkeypatch.setattr(trust_module, "_ORIGINAL_RUNTIME_MODEL_AWARE_WEIGHT_SEGMENTS", base_segments)
    monkeypatch.setattr(runtime, "_model_aware_enabled", lambda: True)
    monkeypatch.setattr(trust_module, "_ensure_step_trust", lambda *_args, **_kwargs: trust)

    resolved = trust_module._model_aware_weight_segments_with_trust(
        runtime,
        call,
        SimpleNamespace(),
        coordinate=0.0,
    )
    assert torch.equal(resolved[0][2], torch.tensor([0.0, 1.0]))
    assert torch.equal(resolved[1][2], baseline_video)
    assert trust_module._state(runtime).trust.applications == 2


def test_offline_replay_does_not_apply_causal_kappa_transfer_even_without_runtime_marker():
    baseline_archive = _archive()
    baseline = _build_smoother(baseline_archive)

    shadow_archive = _archive()
    aggregate = _attach_trust(shadow_archive, audio_kappa=0.0, video_kappa=0.0)
    shadow = _build_smoother(shadow_archive)

    assert aggregate.applications == 0
    assert aggregate.failures == 0
    for key, weights in baseline._forecast_weights.items():
        assert torch.equal(shadow._forecast_weights[key], weights)


def test_replay_native_shadow_oracle_sweep_validation_attenuation_and_endpoint_audit():
    archive = _shadow_archive()
    setattr(archive, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, True)
    aggregate = _attach_replay_shadow_records(archive)
    _build_smoother(archive)
    native = getattr(archive, replay_module._ARCHIVE_NATIVE_SHADOW_ATTR)

    assert aggregate.applications == 0
    assert aggregate.replay_shadow_failures == 0
    for stream in (native.audio, native.video):
        assert stream.count == 3
        assert 0.0 <= stream.mean(stream.oracle_kappa_sum) <= 1.0
        assert 0.0 <= stream.resolved_oracle_kappa_min() <= 1.0
        assert 0.0 <= stream.resolved_oracle_kappa_max() <= 1.0
        assert stream.mean(stream.oracle_ratio_sum) <= stream.mean(stream.baseline_ratio_sum) + 1e-6
        assert stream.mean(stream.local_oracle_ratio_sum) <= stream.mean(stream.baseline_ratio_sum) + 1e-6
        assert stream.mean(stream.candidate_ratio_sums[1.0]) == pytest.approx(
            stream.mean(stream.baseline_ratio_sum), abs=1e-6
        )
        for kappa in replay_module._REPLAY_KAPPAS:
            assert math.isfinite(stream.mean(stream.candidate_ratio_sums[kappa]))
            assert math.isfinite(stream.mean(stream.candidate_advantage_sums[kappa]))

    assert native.audio.mean(native.audio.effective_blend_sum) == pytest.approx(0.0)
    assert native.audio.resolved_effective_blend_min() == pytest.approx(0.0)
    assert native.audio.resolved_effective_blend_max() == pytest.approx(0.0)
    assert 0.0 < native.video.mean(native.video.effective_blend_sum) <= 0.5
    assert 0.0 <= native.video.resolved_effective_blend_min() <= 0.5
    assert 0.0 < native.video.resolved_effective_blend_max() <= 0.5
    assert native.audio.replay_observer_count == 0
    assert native.video.replay_observer_count == 3
    assert -1.0 <= native.audio.causal_error_correlation.correlation() <= 1.0
    assert -1.0 <= native.audio.causal_shrink_correlation.correlation() <= 1.0
    assert -1.0 <= native.video.causal_error_correlation.correlation() <= 1.0
    assert -1.0 <= native.video.causal_shrink_correlation.correlation() <= 1.0
    assert -1.0 <= native.video.replay_error_correlation.correlation() <= 1.0
    assert -1.0 <= native.video.replay_shrink_correlation.correlation() <= 1.0


def test_replay_native_loo_target_is_withheld_from_forecaster(monkeypatch):
    archive = _shadow_archive()
    setattr(archive, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, True)
    _attach_replay_shadow_records(archive)
    smoother = _build_smoother(archive)
    record = archive._model_aware_trust_replay_shadow_records[1]
    samples = trust_module._sample_archive_stream(smoother, 1, 2)
    seen_anchor_ids: list[int | None] = []
    original_update = replay_module.HistoryWeightForecaster.update

    def tracked_update(self, *args, **kwargs):
        seen_anchor_ids.append(kwargs.get("anchor_id"))
        return original_update(self, *args, **kwargs)

    monkeypatch.setattr(replay_module.HistoryWeightForecaster, "update", tracked_update)
    case = replay_module._replay_shadow_case(
        smoother,
        record,
        samples,
        list(smoother._anchor_ids),
    )
    assert case is not None
    assert record.step_id not in case["retained_anchor_ids"]
    assert record.step_id not in seen_anchor_ids
    assert record.latest_anchor_id in case["retained_anchor_ids"]


def test_replay_shadow_audio_video_independence_and_packed_fallback():
    archive = _shadow_archive()
    setattr(archive, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, True)
    _attach_replay_shadow_records(archive)
    _build_smoother(archive)
    native = getattr(archive, replay_module._ARCHIVE_NATIVE_SHADOW_ATTR)
    assert native.audio.count == native.video.count == 3
    assert native.audio.replay_observer_count == 0
    assert native.video.replay_observer_count == 3

    packed = _shadow_archive(packed=True)
    setattr(packed, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, True)
    packed_aggregate = _attach_replay_shadow_records(packed)
    _build_smoother(packed)
    packed_native = getattr(packed, replay_module._ARCHIVE_NATIVE_SHADOW_ATTR)
    assert packed_native.audio.count == 0
    assert packed_native.video.count == 0
    assert packed_aggregate.replay_shadow_failures == 0


def test_replay_shadow_failure_is_diagnostic_and_oom_propagates(monkeypatch):
    archive = _shadow_archive()
    setattr(archive, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, True)
    aggregate = _attach_replay_shadow_records(archive)

    def fail(*_args, **_kwargs):
        raise ValueError("diagnostic setup failed")

    monkeypatch.setattr(trust_module, "_sample_archive_stream", fail)
    smoother = _build_smoother(archive)
    assert aggregate.replay_shadow_failures == 1
    assert smoother._forecast_weights

    oom_archive = _shadow_archive()
    setattr(oom_archive, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, True)
    _attach_replay_shadow_records(oom_archive)

    def oom(*_args, **_kwargs):
        raise torch.cuda.OutOfMemoryError("oom")

    monkeypatch.setattr(trust_module, "_sample_archive_stream", oom)
    with pytest.raises(torch.cuda.OutOfMemoryError):
        _build_smoother(oom_archive)


def test_offline_shadow_state_is_archive_scoped_and_resets():
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            model_aware_mode="full",
            model_aware_trust_shrinkage=True,
        )
    )
    runtime.begin_offline_capture(total_steps=2, sampler_name="sample_euler")
    first = runtime.offline_archive
    assert first is not None
    assert getattr(first, replay_module._ARCHIVE_SHADOW_ONLY_ATTR) is True
    native = replay_module._native_aggregate(first)
    native.audio.count = 9

    runtime.begin_offline_capture(total_steps=2, sampler_name="sample_euler")
    second = runtime.offline_archive
    assert second is not None and second is not first
    assert getattr(second, replay_module._ARCHIVE_SHADOW_ONLY_ATTR) is True
    assert not hasattr(second, replay_module._ARCHIVE_NATIVE_SHADOW_ATTR)


def test_trust_disabled_offline_capture_keeps_existing_behavior():
    runtime = SpectrumH3Runtime(SpectrumH3Config(model_aware_mode="full"))
    runtime.begin_offline_capture(total_steps=2, sampler_name="sample_euler")
    archive = runtime.offline_archive
    assert archive is not None
    assert getattr(archive, replay_module._ARCHIVE_SHADOW_ONLY_ATTR) is False
    assert not hasattr(archive, replay_module._ARCHIVE_NATIVE_SHADOW_ATTR)


def test_er_sde_trust_preserves_schedule_nfe_and_exact_tail_in_shadow_only_mode():
    disabled = _counted_er_sde_first_pass(False)
    enabled = _counted_er_sde_first_pass(True)
    assert enabled["decisions"] == disabled["decisions"]
    assert enabled["actual_calls"] == disabled["actual_calls"]
    assert enabled["actual_calls"] == sum(enabled["decisions"])
    assert enabled["fallbacks"] == disabled["fallbacks"] == 0
    assert enabled["decisions"][-2:] == (True, True)
    assert enabled["reasons"][-2:] == ("final actual tail", "final actual tail")
    assert enabled["applications"] == 0
    assert enabled["failures"] == 0
    assert enabled["shadow_only"] is True


def test_debug_summary_reports_replay_shadow_only_and_new_telemetry():
    archive = _shadow_archive()
    setattr(archive, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, True)
    _attach_replay_shadow_records(archive)
    _build_smoother(archive)
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            model_aware_mode="full",
            model_aware_trust_shrinkage=True,
        )
    )
    runtime._offline_archive = archive
    runtime._offline_phase = "first_pass"
    summary = runtime.debug_summary()
    assert "model_aware_trust_enabled=1" in summary
    assert "model_aware_trust_applied=0" in summary
    assert "model_aware_trust_path=offline_replay_shadow_only" in summary
    assert "model_aware_trust_replay_application=disabled_rejected_causal_transfer" in summary
    assert "model_aware_trust_replay_shadow=loo_validation_attenuated_replay_native_calibration" in summary
    assert "model_aware_trust_replay_shadow_reference=validation_attenuated_corrected_future_bracket" in summary
    assert "model_aware_trust_replay_shadow_audio_oracle_kappa_mean=" in summary
    assert "model_aware_trust_replay_shadow_audio_kappa_1p00_ratio_mean=" in summary
    assert "model_aware_trust_replay_shadow_audio_effective_blend_mean=0.000000" in summary
    assert "model_aware_trust_replay_shadow_audio_observer=inactive_no_spectral_blend" in summary
    assert "model_aware_trust_replay_shadow_video_effective_blend_mean=" in summary
    assert "model_aware_trust_replay_shadow_video_observer=spectral_vs_local" in summary
    assert "model_aware_trust_replay_shadow_video_replay_disagreement_shrink_corr=" in summary
    assert "model_aware_trust_extra_transformer_nfe=0" in summary


def test_single_pass_debug_path_remains_causal():
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            model_aware_mode="full",
            model_aware_trust_shrinkage=True,
        )
    )
    summary = runtime.debug_summary()
    assert "model_aware_trust_path=causal_single_pass" in summary
    assert "model_aware_trust_applied=0" in summary
