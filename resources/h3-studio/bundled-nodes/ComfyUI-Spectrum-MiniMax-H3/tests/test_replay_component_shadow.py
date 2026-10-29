from __future__ import annotations

import pytest
import torch

import comfyui_spectrum_h3.replay_component_shadow as component_module
import comfyui_spectrum_h3.replay_trust_shadow as replay_module
from comfyui_spectrum_h3 import trust_probe as trust_module
from comfyui_spectrum_h3.experiments import OfflineFeatureArchive, OfflineSmoother


def _archive(*, packed: bool = False) -> OfflineFeatureArchive:
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


def _smoother(archive: OfflineFeatureArchive) -> OfflineSmoother:
    packed = not bool(archive.topology)
    return OfflineSmoother(
        archive,
        degree=1,
        ridge_lambda=0.1,
        blend_weight=0.5,
        audio_blend_weight=0.5 if packed else 0.0,
    )


def _record(
    stream_name: str,
    *,
    step_id: int = 4,
    latest_anchor_id: int = 2,
    blend_weight: float | None = None,
    correction_gain: float = 0.15,
    disagreement: float = 0.4,
) -> trust_module._ReplayShadowRecord:
    blend = (
        (0.0 if stream_name == "audio" else 0.5)
        if blend_weight is None
        else float(blend_weight)
    )
    return trust_module._ReplayShadowRecord(
        step_id=step_id,
        coordinate=-1.0 + 0.25 * step_id,
        latest_anchor_id=latest_anchor_id,
        stream_name=stream_name,
        degree=1,
        ridge_lambda=0.1,
        blend_weight=blend,
        correction_gain=correction_gain,
        disagreement=disagreement,
        kappa=0.25,
    )


def _stream_samples(
    smoother: OfflineSmoother,
    stream_name: str,
) -> torch.Tensor:
    ranges = {name: (start, end) for name, start, end in smoother._stream_ranges}
    start, end = ranges[stream_name]
    return trust_module._sample_archive_stream(smoother, start, end)


def _fake_case(
    *,
    local_kappa: float,
    replay_disagreement: float | None,
) -> dict[str, object]:
    axes = {
        name: {"oracle_ratio": 0.7, "oracle_kappa": 0.5}
        for name in component_module._AXES
    }
    axes["local_to_current"] = {
        "oracle_ratio": 0.7,
        "oracle_kappa": local_kappa,
    }
    axes["local_to_blend_uncorrected"] = {
        "oracle_ratio": 0.7,
        "oracle_kappa": local_kappa,
    }
    return {
        "candidate_ratios": {
            "local": 0.8,
            "blend_uncorrected": 0.9,
            "local_corrected": 0.85,
            "blend_corrected": 1.0,
        },
        "axes": axes,
        "replay_disagreement": replay_disagreement,
        "correction_gain": 0.1,
        "local_correction_advantage": -0.0625,
        "blend_correction_advantage": -1.0 / 9.0,
        "correction_blend_interaction_ratio_delta": 0.05,
        "local_residual_replay_delta_projection": 0.0,
        "blend_residual_replay_delta_projection": 0.0,
        "local_residual_replay_delta_cosine": 0.0,
        "blend_residual_replay_delta_cosine": 0.0,
        "causal_replay_delta_cosine": 0.0,
        "local_projection_minus_causal_gain": -0.1,
        "blend_projection_minus_causal_gain": -0.1,
    }


def test_component_candidates_match_replay_construction_and_audio_zero_blend():
    archive = _archive()
    smoother = _smoother(archive)
    audio_record = _record("audio")
    samples = _stream_samples(smoother, "audio")
    anchor_ids = list(smoother._anchor_ids)

    candidates = component_module._construct_candidates(
        smoother,
        audio_record,
        samples,
        anchor_ids,
    )
    assert candidates is not None
    assert torch.allclose(candidates.local, candidates.blend_uncorrected)
    assert torch.allclose(
        candidates.local_corrected,
        candidates.local + audio_record.correction_gain * candidates.correction_delta,
    )
    assert torch.allclose(
        candidates.blend_corrected,
        candidates.blend_uncorrected
        + audio_record.correction_gain * candidates.correction_delta,
    )

    case = component_module._decomposition_case(
        smoother,
        audio_record,
        samples,
        anchor_ids,
    )
    legacy = replay_module._replay_shadow_case(
        smoother,
        audio_record,
        samples,
        anchor_ids,
    )
    assert case is not None and legacy is not None
    assert case["candidate_ratios"]["local"] == pytest.approx(
        case["candidate_ratios"]["blend_uncorrected"]
    )
    assert case["candidate_ratios"]["blend_corrected"] == pytest.approx(
        legacy["baseline_ratio"]
    )


def test_video_exposes_all_four_component_candidates():
    archive = _archive()
    smoother = _smoother(archive)
    record = _record("video")
    samples = _stream_samples(smoother, "video")
    case = component_module._decomposition_case(
        smoother,
        record,
        samples,
        list(smoother._anchor_ids),
    )
    assert case is not None
    assert set(case["candidate_ratios"]) == set(component_module._CANDIDATES)
    assert set(case["axes"]) == set(component_module._AXES)
    assert case["replay_disagreement"] is not None


def test_oracle_axes_interpolate_and_clamp_without_applying_coefficients():
    hold_rms = torch.tensor(1.0)
    start = torch.tensor([0.0, 0.0])
    end = torch.tensor([2.0, 0.0])
    ratio, kappa = component_module._axis_score(
        torch.tensor([1.0, 0.0]),
        start,
        end,
        hold_rms,
    )
    assert float(kappa) == pytest.approx(0.5)
    assert float(ratio) == pytest.approx(0.0)

    _, low = component_module._axis_score(
        torch.tensor([-1.0, 0.0]),
        start,
        end,
        hold_rms,
    )
    _, high = component_module._axis_score(
        torch.tensor([3.0, 0.0]),
        start,
        end,
        hold_rms,
    )
    assert float(low) == pytest.approx(0.0)
    assert float(high) == pytest.approx(1.0)


def test_ratio_advantage_and_retargeted_correlations_use_local_oracle():
    stream = component_module._ReplayComponentStream()
    for disagreement, local_kappa in ((0.1, 0.2), (0.4, 0.5), (0.8, 0.9)):
        stream.record(
            _fake_case(
                local_kappa=local_kappa,
                replay_disagreement=disagreement,
            ),
            causal_disagreement=disagreement,
        )

    assert stream.mean_candidate_advantage("local") == pytest.approx(0.2)
    assert stream.mean_candidate_advantage("blend_corrected") == pytest.approx(0.0)
    assert stream.causal_local_kappa_corr.correlation() > 0.99
    assert stream.causal_required_local_corr.correlation() < -0.99
    assert stream.replay_local_kappa_corr.correlation() > 0.99
    assert stream.replay_required_local_corr.correlation() < -0.99


def test_main_loo_target_is_absent_from_candidate_and_validation_construction():
    archive = _archive()
    smoother = _smoother(archive)
    record = _record("video")
    samples = _stream_samples(smoother, "video")
    anchor_ids = list(smoother._anchor_ids)
    target_index = anchor_ids.index(record.step_id)

    first = component_module._construct_candidates(
        smoother,
        record,
        samples,
        anchor_ids,
    )
    altered = samples.clone()
    altered[target_index].add_(10000.0)
    second = component_module._construct_candidates(
        smoother,
        record,
        altered,
        anchor_ids,
    )
    assert first is not None and second is not None
    assert record.step_id not in first.retained_anchor_ids
    for name in (
        "local",
        "blend_uncorrected",
        "local_corrected",
        "blend_corrected",
        "spectral",
        "hold",
        "correction_delta",
    ):
        assert torch.equal(getattr(first, name), getattr(second, name))


def test_direction_diagnostics_compare_replay_residual_and_causal_delta():
    archive = _archive()
    smoother = _smoother(archive)
    record = _record("video", correction_gain=0.2)
    samples = _stream_samples(smoother, "video")
    case = component_module._decomposition_case(
        smoother,
        record,
        samples,
        list(smoother._anchor_ids),
    )
    assert case is not None
    for name in (
        "local_residual_replay_delta_projection",
        "blend_residual_replay_delta_projection",
        "local_residual_replay_delta_cosine",
        "blend_residual_replay_delta_cosine",
        "causal_replay_delta_cosine",
        "local_projection_minus_causal_gain",
        "blend_projection_minus_causal_gain",
    ):
        assert case[name] is not None
        assert torch.isfinite(torch.tensor(case[name]))
    assert case["local_projection_minus_causal_gain"] == pytest.approx(
        case["local_residual_replay_delta_projection"] - record.correction_gain
    )


def test_validation_keeps_audio_video_separate_and_is_archive_scoped():
    archive = _archive()
    smoother = _smoother(archive)
    trust_aggregate = trust_module._TrustAggregate()
    archive._model_aware_trust_aggregate = trust_aggregate
    archive._model_aware_trust_replay_shadow_records = [
        _record("audio", step_id=2, latest_anchor_id=0),
        _record("audio", step_id=4, latest_anchor_id=2),
        _record("video", step_id=2, latest_anchor_id=0),
        _record("video", step_id=4, latest_anchor_id=2),
    ]
    component_module._validate_replay_decomposition(smoother, trust_aggregate)
    aggregate = component_module._component_aggregate(archive)
    assert aggregate.audio.count == 2
    assert aggregate.video.count == 2
    assert aggregate.audio.replay_observer_count == 0
    assert aggregate.video.replay_observer_count == 2

    other = _archive()
    other_aggregate = component_module._component_aggregate(other)
    assert other_aggregate is not aggregate
    assert other_aggregate.audio.count == 0
    assert other_aggregate.video.count == 0


def test_packed_topology_does_not_fabricate_stream_decomposition():
    archive = _archive(packed=True)
    smoother = _smoother(archive)
    trust_aggregate = trust_module._TrustAggregate()
    archive._model_aware_trust_replay_shadow_records = [_record("audio")]
    component_module._validate_replay_decomposition(smoother, trust_aggregate)
    aggregate = component_module._component_aggregate(archive)
    assert aggregate.audio.count == 0
    assert aggregate.video.count == 0
    assert trust_aggregate.replay_shadow_failures == 0


def test_component_diagnostic_failure_isolated_and_oom_propagates(monkeypatch):
    archive = _archive()
    smoother = _smoother(archive)
    record = _record("audio")
    archive._model_aware_trust_replay_shadow_records = [record]
    aggregate = trust_module._TrustAggregate()

    def ordinary_failure(*_args, **_kwargs):
        raise AttributeError("diagnostic failure")

    monkeypatch.setattr(component_module, "_decomposition_case", ordinary_failure)
    component_module._validate_replay_decomposition(smoother, aggregate)
    assert aggregate.replay_shadow_failures == 1

    def oom_failure(*_args, **_kwargs):
        raise torch.cuda.OutOfMemoryError("oom")

    monkeypatch.setattr(component_module, "_decomposition_case", oom_failure)
    with pytest.raises(torch.cuda.OutOfMemoryError):
        component_module._validate_replay_decomposition(smoother, aggregate)


def test_debug_summary_is_inert_without_opt_in_archive(monkeypatch):
    runtime = object.__new__(replay_module.SpectrumH3Runtime)
    runtime._offline_archive = _archive()
    monkeypatch.setattr(
        component_module,
        "_ORIGINAL_RUNTIME_DEBUG_SUMMARY",
        lambda _runtime: "baseline-summary",
    )
    assert (
        component_module._debug_summary_with_replay_decomposition(runtime)
        == "baseline-summary"
    )
