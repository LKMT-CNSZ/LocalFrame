from __future__ import annotations

from types import SimpleNamespace

import pytest
import torch

from comfyui_spectrum_h3 import replay_component_shadow as component_module
from comfyui_spectrum_h3 import replay_spectral_alpha_shadow as alpha_module
from comfyui_spectrum_h3 import replay_trust_shadow as replay_module
from comfyui_spectrum_h3 import trust_probe as trust_module


def _record(*, stream_name: str = "video") -> trust_module._ReplayShadowRecord:
    return trust_module._ReplayShadowRecord(
        step_id=2,
        coordinate=0.2,
        latest_anchor_id=0,
        stream_name=stream_name,
        degree=1,
        ridge_lambda=0.1,
        blend_weight=0.5 if stream_name == "video" else 0.0,
        correction_gain=-0.1,
        disagreement=0.4,
        kappa=0.25,
    )


def _scored_case(
    *,
    local_ratio: float = 0.8,
    current_ratio: float = 0.75,
    oracle_ratio: float = 0.6,
    oracle_weight: float = 0.2,
    current_weight: float = 0.4,
    validation_penalty: float = 2.0,
    spectral_gap: float = 0.3,
    alpha_ratios: dict[float, float] | None = None,
) -> dict[str, object]:
    if alpha_ratios is None:
        alpha_ratios = {
            0.00: local_ratio,
            0.25: 0.74,
            0.50: 0.68,
            0.75: 0.71,
            1.00: current_ratio,
        }
    return {
        "local_ratio": local_ratio,
        "current_ratio": current_ratio,
        "oracle_ratio": oracle_ratio,
        "oracle_weight": oracle_weight,
        "current_weight": current_weight,
        "validation_penalty": validation_penalty,
        "spectral_gap": spectral_gap,
        "alpha_ratios": alpha_ratios,
        "alpha_weights": {
            alpha: max(0.0, min(1.0, alpha * current_weight))
            for alpha in alpha_module._ALPHAS
        },
    }


def test_alpha_endpoints_and_projected_weight_formula():
    local = torch.tensor([[1.0, -1.0]], dtype=torch.float32)
    current = torch.tensor([[2.0, 3.0]], dtype=torch.float32)

    assert torch.equal(alpha_module._alpha_prediction(local, current, 0.0), local)
    assert torch.equal(alpha_module._alpha_prediction(local, current, 1.0), current)
    assert torch.equal(
        alpha_module._alpha_prediction(local, current, 0.5),
        local + 0.5 * (current - local),
    )

    weight = torch.tensor(0.8)
    assert float(alpha_module._scaled_projected_weight(weight, 0.0)) == pytest.approx(0.0)
    assert float(alpha_module._scaled_projected_weight(weight, 0.5)) == pytest.approx(0.4)
    assert float(alpha_module._scaled_projected_weight(weight, 1.0)) == pytest.approx(0.8)
    assert float(alpha_module._scaled_projected_weight(weight, 2.0)) == pytest.approx(1.0)


def test_alpha_case_preserves_local_and_current_endpoints(monkeypatch):
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
        local_corrected=torch.tensor([[0.9, 0.0]]),
        blend_corrected=torch.tensor([[1.4, 0.0]]),
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

    case = alpha_module._alpha_case(
        SimpleNamespace(),
        _record(),
        samples,
        [0, 2, 4],
    )

    assert case is not None
    assert case["alpha_ratios"][0.0] == pytest.approx(case["local_ratio"])
    assert case["alpha_ratios"][1.0] == pytest.approx(case["current_ratio"])
    assert case["current_weight"] == pytest.approx(0.25)
    assert case["alpha_weights"][0.5] == pytest.approx(0.125)
    assert case["validation_penalty"] == pytest.approx(2.0)


def test_target_value_does_not_change_pre_target_alpha_observables(monkeypatch):
    candidates = component_module._ReplayCandidates(
        retained_anchor_ids=(0, 4),
        local=torch.tensor([[1.0, 0.0]]),
        blend_uncorrected=torch.tensor([[1.5, 0.0]]),
        local_corrected=torch.tensor([[0.9, 0.0]]),
        blend_corrected=torch.tensor([[1.4, 0.0]]),
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

    samples_a = torch.tensor([[[0.0, 0.0]], [[2.0, 0.0]], [[4.0, 0.0]]])
    samples_b = samples_a.clone()
    samples_b[1] = torch.tensor([[8.0, 4.0]])

    case_a = alpha_module._alpha_case(SimpleNamespace(), _record(), samples_a, [0, 2, 4])
    case_b = alpha_module._alpha_case(SimpleNamespace(), _record(), samples_b, [0, 2, 4])

    assert case_a is not None and case_b is not None
    for key in ("current_weight", "validation_penalty", "spectral_gap"):
        assert case_a[key] == pytest.approx(case_b[key])
    assert case_a["alpha_weights"] == pytest.approx(case_b["alpha_weights"])
    assert case_a["oracle_ratio"] != pytest.approx(case_b["oracle_ratio"])


def test_headroom_capture_formula_and_tiny_denominator_guard():
    aggregate = alpha_module._AlphaAggregate()
    aggregate.record(_scored_case(), causal_disagreement=0.4, coordinate=0.2)

    evaluable, capture = aggregate.headroom_capture(0.50)
    assert evaluable is True
    assert capture == pytest.approx((0.8 - 0.68) / (0.8 - 0.6))

    flat = alpha_module._AlphaAggregate()
    flat.record(
        _scored_case(
            local_ratio=0.8,
            current_ratio=0.8,
            oracle_ratio=0.8,
            alpha_ratios={alpha: 0.8 for alpha in alpha_module._ALPHAS},
        ),
        causal_disagreement=0.4,
        coordinate=0.2,
    )
    evaluable, capture = flat.headroom_capture(0.50)
    assert evaluable is False
    assert capture == 0.0


def test_weight_error_mae_rmse_and_signed_bias():
    stats = alpha_module._AlphaStats()
    for predicted, oracle in ((0.2, 0.0), (0.4, 0.2)):
        stats.record(
            ratio=0.7,
            local_ratio=0.8,
            current_ratio=0.75,
            oracle_ratio=0.6,
            predicted_weight=predicted,
            oracle_weight=oracle,
            causal_disagreement=0.4,
            validation_penalty=2.0,
            spectral_gap=0.3,
            coordinate=0.2,
            current_weight=0.4,
        )

    assert stats.mean(stats.weight_abs_error_sum) == pytest.approx(0.2)
    assert stats.rmse() == pytest.approx(0.2)
    assert stats.mean(stats.weight_signed_error_sum) == pytest.approx(0.2)


def test_near_zero_oracle_floor_telemetry_and_error_contribution():
    aggregate = alpha_module._AlphaAggregate()
    aggregate.record(
        _scored_case(oracle_weight=0.0, current_weight=0.4),
        causal_disagreement=0.2,
        coordinate=0.1,
    )
    aggregate.record(
        _scored_case(oracle_weight=0.2, current_weight=0.4),
        causal_disagreement=0.6,
        coordinate=0.3,
    )

    best_stats = aggregate.alpha[0.50]
    assert alpha_module._NEAR_ZERO_ORACLE_TOLERANCE == pytest.approx(1e-3)
    assert aggregate.near_zero_count == 1
    assert aggregate.near_zero_fraction() == pytest.approx(0.5)
    assert aggregate.near_zero_current_weight_mean() == pytest.approx(0.4)
    assert best_stats.near_zero_mean(best_stats.near_zero_weight_sum) == pytest.approx(0.2)
    assert best_stats.near_zero_mean(best_stats.near_zero_abs_error_sum) == pytest.approx(0.2)
    assert 0.0 <= best_stats.near_zero_mae_contribution() <= 1.0
    assert 0.0 <= best_stats.near_zero_squared_error_contribution() <= 1.0


def test_best_alpha_uses_mean_ratio_and_lower_alpha_tiebreak():
    aggregate = alpha_module._AlphaAggregate()
    case = _scored_case(
        alpha_ratios={
            0.00: 0.80,
            0.25: 0.70,
            0.50: 0.70,
            0.75: 0.72,
            1.00: 0.75,
        }
    )
    aggregate.record(case, causal_disagreement=0.4, coordinate=0.2)
    assert aggregate.best_alpha() == pytest.approx(0.25)


def test_residual_correlations_are_recorded_after_oracle_scoring():
    aggregate = alpha_module._AlphaAggregate()
    for index, current_weight in enumerate((0.2, 0.4, 0.6)):
        oracle_weight = 0.5 * current_weight
        aggregate.record(
            _scored_case(
                oracle_weight=oracle_weight,
                current_weight=current_weight,
                validation_penalty=1.0 + index,
                spectral_gap=0.1 + 0.1 * index,
            ),
            causal_disagreement=0.1 + 0.2 * index,
            coordinate=-0.5 + 0.5 * index,
        )

    stats = aggregate.alpha[1.0]
    assert stats.residual_current_weight_corr.correlation() < -0.99
    assert stats.residual_causal_corr.count == 3
    assert stats.residual_validation_corr.count == 3
    assert stats.residual_spectral_gap_corr.count == 3
    assert stats.residual_coordinate_corr.count == 3


def test_alpha_shadow_is_video_only(monkeypatch):
    called = False

    def unexpected(*_args, **_kwargs):
        nonlocal called
        called = True
        raise AssertionError("audio must not enter alpha candidate construction")

    monkeypatch.setattr(component_module, "_construct_candidates", unexpected)
    result = alpha_module._alpha_case(
        SimpleNamespace(),
        _record(stream_name="audio"),
        torch.zeros((3, 1, 1)),
        [0, 2, 4],
    )
    assert result is None
    assert called is False


def test_validate_alpha_shadow_packed_topology_without_video_is_noop():
    archive = SimpleNamespace(
        _model_aware_trust_replay_shadow_records=[_record()],
    )
    smoother = SimpleNamespace(
        archive=archive,
        _stream_ranges=(),
        _anchor_ids=(0, 2, 4),
    )
    trust = trust_module._TrustAggregate()

    alpha_module._validate_alpha_shadow(smoother, trust)

    assert trust.replay_shadow_failures == 0
    assert alpha_module._aggregate(archive).count == 0


def test_upstream_spectral_failure_prevents_dependent_alpha(monkeypatch):
    trust = trust_module._TrustAggregate()
    alpha_calls = 0

    def spectral_failure(_smoother, aggregate):
        aggregate.replay_shadow_failures += 1

    def alpha_call(_smoother, _aggregate):
        nonlocal alpha_calls
        alpha_calls += 1

    monkeypatch.setattr(alpha_module, "_ORIGINAL_SPECTRAL_VALIDATOR", spectral_failure)
    monkeypatch.setattr(alpha_module, "_validate_alpha_shadow", alpha_call)

    alpha_module._validate_spectral_with_alpha(SimpleNamespace(), trust)

    assert trust.replay_shadow_failures == 1
    assert alpha_calls == 0


def test_ordinary_alpha_failure_is_diagnostic_and_oom_propagates(monkeypatch):
    archive = SimpleNamespace(
        _model_aware_trust_replay_shadow_records=[_record()],
    )
    smoother = SimpleNamespace(
        archive=archive,
        _stream_ranges=(("video", 0, 1),),
        _anchor_ids=(0, 2, 4),
    )
    trust = trust_module._TrustAggregate()

    monkeypatch.setattr(
        trust_module,
        "_sample_archive_stream",
        lambda *_args, **_kwargs: torch.zeros((3, 1, 1)),
    )
    monkeypatch.setattr(
        alpha_module,
        "_alpha_case",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("diagnostic")),
    )
    alpha_module._validate_alpha_shadow(smoother, trust)
    assert trust.replay_shadow_failures == 1
    assert alpha_module._aggregate(archive).count == 0

    monkeypatch.setattr(
        alpha_module,
        "_alpha_case",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            torch.cuda.OutOfMemoryError("oom")
        ),
    )
    with pytest.raises(torch.cuda.OutOfMemoryError):
        alpha_module._validate_alpha_shadow(smoother, trust)


def test_archive_state_is_scoped_and_summary_is_shadow_only(monkeypatch):
    archive_a = SimpleNamespace()
    archive_b = SimpleNamespace()
    assert alpha_module._aggregate(archive_a) is not alpha_module._aggregate(archive_b)

    setattr(archive_a, replay_module._ARCHIVE_SHADOW_ONLY_ATTR, True)
    aggregate = alpha_module._aggregate(archive_a)
    aggregate.record(_scored_case(), causal_disagreement=0.4, coordinate=0.2)

    runtime = SimpleNamespace(_offline_archive=archive_a)
    monkeypatch.setattr(
        alpha_module,
        "_ORIGINAL_RUNTIME_DEBUG_SUMMARY",
        lambda _runtime: (
            "baseline-summary "
            "model_aware_trust_replay_spectral_mixture_applied=0 "
            "model_aware_trust_replay_decomposition=stable"
        ),
    )
    summary = alpha_module._debug_summary_with_alpha(runtime)
    assert "baseline-summary" in summary
    assert "model_aware_trust_replay_spectral_mixture_applied=0" in summary
    assert "model_aware_trust_replay_decomposition=stable" in summary
    assert "model_aware_trust_replay_spectral_alpha_applied=0" in summary
    assert "model_aware_trust_replay_spectral_alpha_video_0p50_weight_mae=" in summary
    assert "audio" not in summary.split("model_aware_trust_replay_spectral_alpha=", 1)[1]


def test_alpha_validation_does_not_mutate_replay_geometry(monkeypatch):
    archive = SimpleNamespace(
        _model_aware_trust_replay_shadow_records=[_record()],
    )
    smoother = SimpleNamespace(
        archive=archive,
        _stream_ranges=(("video", 0, 1),),
        _anchor_ids=(0, 2, 4),
        sentinel_validation_attenuation=0.37,
        sentinel_anchor_ids=(0, 2, 4),
    )
    trust = trust_module._TrustAggregate()

    monkeypatch.setattr(
        trust_module,
        "_sample_archive_stream",
        lambda *_args, **_kwargs: torch.zeros((3, 1, 1)),
    )
    monkeypatch.setattr(
        alpha_module,
        "_alpha_case",
        lambda *_args, **_kwargs: _scored_case(),
    )

    alpha_module._validate_alpha_shadow(smoother, trust)

    assert smoother.sentinel_validation_attenuation == pytest.approx(0.37)
    assert smoother.sentinel_anchor_ids == (0, 2, 4)
    assert trust.replay_shadow_failures == 0
    assert alpha_module._aggregate(archive).count == 1
