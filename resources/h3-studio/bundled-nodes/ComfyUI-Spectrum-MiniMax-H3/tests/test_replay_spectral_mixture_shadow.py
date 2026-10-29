from __future__ import annotations

from types import SimpleNamespace

import pytest
import torch

from comfyui_spectrum_h3 import replay_component_shadow as component_module
from comfyui_spectrum_h3 import replay_spectral_mixture_shadow as spectral_module
from comfyui_spectrum_h3 import replay_trust_shadow as replay_module
from comfyui_spectrum_h3 import trust_probe as trust_module


def _record() -> trust_module._ReplayShadowRecord:
    return trust_module._ReplayShadowRecord(
        step_id=2,
        coordinate=0.2,
        latest_anchor_id=0,
        stream_name="video",
        degree=1,
        ridge_lambda=0.1,
        blend_weight=0.5,
        correction_gain=-0.1,
        disagreement=0.4,
        kappa=0.25,
    )


def _case(
    *,
    oracle_weight: float,
    current_weight: float,
    spectral_gap: float,
    validation_penalty: float,
) -> dict[str, object]:
    return {
        "local_ratio": 0.8,
        "current_blend_ratio": 0.75,
        "spectral_ratio": 0.9,
        "oracle_ratio": 0.6,
        "oracle_weight": oracle_weight,
        "current_weight_projection": current_weight,
        "effective_blend_mean": 0.25,
        "validation_penalty_mean": validation_penalty,
        "spectral_gap": spectral_gap,
        "fixed_ratios": {
            weight: 0.8 - 0.1 * min(weight, 0.5)
            for weight in spectral_module._FIXED_WEIGHTS
        },
    }


def test_spectral_case_targets_full_local_to_spectral_segment(monkeypatch):
    record = _record()
    samples = torch.tensor(
        [
            [[0.0, 0.0]],
            [[2.0, 0.0]],
            [[4.0, 0.0]],
        ],
        dtype=torch.float32,
    )
    candidates = component_module._ReplayCandidates(
        retained_anchor_ids=(0, 4),
        local=torch.tensor([[1.0, 0.0]]),
        blend_uncorrected=torch.tensor([[1.5, 0.0]]),
        local_corrected=torch.tensor([[1.0, 0.0]]),
        blend_corrected=torch.tensor([[1.5, 0.0]]),
        spectral=torch.tensor([[3.0, 0.0]]),
        hold=torch.tensor([[0.0, 0.0]]),
        correction_delta=torch.tensor([[1.0, 0.0]]),
        causal_delta=None,
    )
    monkeypatch.setattr(
        component_module,
        "_construct_candidates",
        lambda *_args, **_kwargs: candidates,
    )
    monkeypatch.setattr(
        replay_module,
        "_effective_blends_for_withheld_target",
        lambda *_args, **_kwargs: torch.tensor([0.25]),
    )

    case = spectral_module._spectral_case(
        SimpleNamespace(),
        record,
        samples,
        [0, 2, 4],
    )

    assert case is not None
    assert case["oracle_weight"] == pytest.approx(0.5)
    assert case["oracle_ratio"] == pytest.approx(0.0)
    assert case["current_weight_projection"] == pytest.approx(0.25)
    assert case["effective_blend_mean"] == pytest.approx(0.25)
    assert case["validation_penalty_mean"] == pytest.approx(2.0)
    assert case["fixed_ratios"][0.5] == pytest.approx(0.0)
    assert case["local_ratio"] == pytest.approx(case["spectral_ratio"])


def test_stream_correlations_target_absolute_weight_and_required_adjustment():
    stream = spectral_module._SpectralMixtureStream()
    points = (
        (0.1, 0.2, 0.05, 1.1, -0.5),
        (0.4, 0.5, 0.20, 1.5, 0.0),
        (0.8, 0.9, 0.35, 2.0, 0.5),
    )
    for causal, oracle, current, validation, coordinate in points:
        stream.record(
            _case(
                oracle_weight=oracle,
                current_weight=current,
                spectral_gap=causal,
                validation_penalty=validation,
            ),
            causal_disagreement=causal,
            coordinate=coordinate,
        )

    assert stream.count == 3
    assert stream.causal_weight_corr.correlation() > 0.99
    assert stream.spectral_gap_weight_corr.correlation() > 0.99
    assert stream.validation_weight_corr.correlation() > 0.99
    assert stream.coordinate_weight_corr.correlation() > 0.99
    assert stream.causal_adjustment_corr.correlation() > 0.99
    assert stream.spectral_gap_adjustment_corr.correlation() > 0.99


def test_component_failure_prevents_dependent_spectral_shadow(monkeypatch):
    aggregate = trust_module._TrustAggregate()
    spectral_calls = 0

    def component_failure(_smoother, trust_aggregate):
        trust_aggregate.replay_shadow_failures += 1

    def record_spectral_call(_smoother, _aggregate):
        nonlocal spectral_calls
        spectral_calls += 1

    monkeypatch.setattr(
        spectral_module,
        "_ORIGINAL_COMPONENT_VALIDATOR",
        component_failure,
    )
    monkeypatch.setattr(
        spectral_module,
        "_validate_spectral_mixture_shadow",
        record_spectral_call,
    )

    spectral_module._validate_component_with_spectral_mixture(
        SimpleNamespace(),
        aggregate,
    )
    assert aggregate.replay_shadow_failures == 1
    assert spectral_calls == 0


def test_summary_is_shadow_only_and_reports_fixed_sweep(monkeypatch):
    archive = SimpleNamespace()
    setattr(archive, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, True)
    aggregate = spectral_module._aggregate(archive)
    aggregate.video.record(
        _case(
            oracle_weight=0.5,
            current_weight=0.25,
            spectral_gap=0.4,
            validation_penalty=2.0,
        ),
        causal_disagreement=0.4,
        coordinate=0.2,
    )
    runtime = SimpleNamespace(_offline_archive=archive)
    monkeypatch.setattr(
        spectral_module,
        "_ORIGINAL_RUNTIME_DEBUG_SUMMARY",
        lambda _runtime: "baseline-summary",
    )

    summary = spectral_module._debug_summary_with_spectral_mixture(runtime)
    assert "baseline-summary" in summary
    assert "model_aware_trust_replay_spectral_mixture_applied=0" in summary
    assert "model_aware_trust_replay_spectral_video_oracle_weight_mean=0.500000" in summary
    assert "model_aware_trust_replay_spectral_video_fixed_0p50_ratio_mean=" in summary
