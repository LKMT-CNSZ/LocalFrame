from __future__ import annotations

from types import SimpleNamespace

from comfyui_spectrum_h3 import replay_component_shadow as component_module
from comfyui_spectrum_h3 import replay_shadow_composition as composition_module
from comfyui_spectrum_h3 import trust_probe as trust_module


def test_composed_replay_shadow_does_not_cascade_native_failure(monkeypatch):
    archive = SimpleNamespace(
        _model_aware_trust_replay_shadow_records=[
            trust_module._ReplayShadowRecord(
                step_id=2,
                coordinate=0.0,
                latest_anchor_id=0,
                stream_name="audio",
                degree=1,
                ridge_lambda=0.1,
                blend_weight=0.0,
                correction_gain=0.1,
                disagreement=0.2,
                kappa=0.5,
            ),
            trust_module._ReplayShadowRecord(
                step_id=2,
                coordinate=0.0,
                latest_anchor_id=0,
                stream_name="video",
                degree=1,
                ridge_lambda=0.1,
                blend_weight=0.5,
                correction_gain=0.1,
                disagreement=0.2,
                kappa=0.5,
            ),
        ]
    )
    smoother = SimpleNamespace(archive=archive)
    aggregate = trust_module._TrustAggregate()

    def recoverable_native_failure(_smoother, trust_aggregate):
        trust_aggregate.replay_shadow_failures += 1

    component_calls = 0

    def record_component_call(_smoother, _aggregate):
        nonlocal component_calls
        component_calls += 1

    monkeypatch.setattr(
        composition_module,
        "_NATIVE_REPLAY_VALIDATOR",
        recoverable_native_failure,
    )
    monkeypatch.setattr(
        component_module,
        "_validate_replay_decomposition",
        record_component_call,
    )
    composition_module._validate_composed_replay_shadows(smoother, aggregate)

    component = component_module._component_aggregate(archive)
    assert aggregate.replay_shadow_failures == 1
    assert component_calls == 0
    assert component.audio.count == 0
    assert component.video.count == 0
