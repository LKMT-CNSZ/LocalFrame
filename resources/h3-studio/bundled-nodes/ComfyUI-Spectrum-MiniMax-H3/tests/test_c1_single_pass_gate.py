from __future__ import annotations

import re

import torch

from comfyui_spectrum_h3.config import SpectrumH3Config
from comfyui_spectrum_h3.model_aware import ModelForecastabilityProfile, ProfileLookup
from comfyui_spectrum_h3.runtime import SpectrumH3Runtime


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


def _summary_int(summary: str, field: str) -> int:
    match = re.search(rf"(?:^| ){re.escape(field)}=(-?\d+)(?: |$)", summary)
    assert match is not None, field
    return int(match.group(1))


def _single_pass_er_sde(trust_enabled: bool) -> dict[str, object]:
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            degree=1,
            max_history=6,
            warmup_steps=2,
            tail_actual_steps=1,
            bootstrap_first_forecast=False,
            model_aware_mode="full",
            model_aware_risk_threshold=0.65,
            model_aware_trust_shrinkage=trust_enabled,
            offline_smoothing_replay=False,
            audio_blend_weight=0.0,
            blend_weight=0.5,
        )
    )
    runtime.set_model_profile(_profile_lookup())
    sigmas = torch.tensor([1.0, 0.82, 0.64, 0.46, 0.28, 0.10, 0.0])
    topology = (("target_audio_rows", 1), ("target_video_rows", 1))
    labels = ("branch",)
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

        summary = runtime.debug_summary()
        result = {
            "decisions": tuple(decisions),
            "reasons": tuple(reasons),
            "actual_calls": runtime.stats.actual_transformer_calls,
            "fallbacks": runtime.stats.forecast_fallbacks,
            "summary": summary,
        }
    finally:
        runtime.end_run(run_id)
    return result


def test_c1_single_pass_trust_is_mechanically_isolated():
    baseline = _single_pass_er_sde(False)
    candidate = _single_pass_er_sde(True)

    assert candidate["decisions"] == baseline["decisions"]
    assert candidate["reasons"] == baseline["reasons"]
    assert candidate["actual_calls"] == baseline["actual_calls"]
    assert candidate["actual_calls"] == sum(candidate["decisions"])
    assert candidate["fallbacks"] == baseline["fallbacks"] == 0
    assert candidate["decisions"][-1] is True
    assert candidate["reasons"][-1] == "final actual tail"
    assert candidate["reasons"][-2] != "ER-SDE offline replay penultimate exact anchor"

    baseline_summary = str(baseline["summary"])
    candidate_summary = str(candidate["summary"])
    assert "model_aware_trust_enabled=0" in baseline_summary
    assert "model_aware_trust_applied=0" in baseline_summary
    assert "model_aware_trust_path=disabled" in baseline_summary
    assert "model_aware_trust_applications=0" in baseline_summary

    assert "model_aware_trust_enabled=1" in candidate_summary
    assert "model_aware_trust_applied=1" in candidate_summary
    assert "model_aware_trust_path=causal_single_pass" in candidate_summary
    assert _summary_int(candidate_summary, "model_aware_trust_applications") > 0

    for summary in (baseline_summary, candidate_summary):
        assert "model_aware_trust_extra_transformer_nfe=0" in summary
        assert "model_aware_trust_failures=0" in summary
        assert "offline_replay_shadow_only" not in summary
        assert "model_aware_trust_replay_application=disabled_rejected_causal_transfer" not in summary
