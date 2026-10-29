from __future__ import annotations

from types import SimpleNamespace

import pytest
import torch

from comfyui_spectrum_h3 import minimax_h3 as minimax_h3_module
from comfyui_spectrum_h3.config import SpectrumH3Config
from comfyui_spectrum_h3.minimax_h3 import (
    _apply_exact_state_input_embedding_,
    _sanitize_prediction,
    diffusion_model_wrapper,
    is_native_minimax_h3,
    locate_minimax_h3_inner,
    require_native_minimax_h3,
)
from comfyui_spectrum_h3.runtime import SpectrumH3Runtime
from comfyui_spectrum_h3.sampling import (
    BINDING_KEY,
    RUN_ID_KEY,
    RUNTIME_KEY,
    STEP_ID_KEY,
    SpectrumH3Binding,
    model_clone_callback,
)


def _native_shaped_fake(*, use_adaln_curves=False):
    cls = type("MiniMaxH3Model", (), {})
    cls.__module__ = "comfy.ldm.minimax.model"
    instance = cls()
    for name, value in {
        "blocks": [object()],
        "final_layer": object(),
        "hidden_size": 8,
        "patch_size": (1, 2, 2),
        "latents_dim": 24,
        "audio_latents_dim": 32,
        "sigma_shift_video": 12.0,
        "sigma_shift_audio": 3.0,
        "use_adaln_curves": use_adaln_curves,
        "video_patch_proj": object(),
        "audio_patch_proj": object(),
    }.items():
        setattr(instance, name, value)
    if use_adaln_curves:
        instance.adaln_t_table = object()
    else:
        instance.time_embedder = object()
    return instance


def test_model_detection_accepts_only_native_h3_identity_and_shape():
    inner = _native_shaped_fake()
    patcher = SimpleNamespace(model=SimpleNamespace(diffusion_model=inner))
    assert locate_minimax_h3_inner(patcher) == (inner, "model.diffusion_model")
    assert is_native_minimax_h3(inner)
    assert require_native_minimax_h3(patcher)[0] is inner
    with pytest.raises(TypeError, match="requires ComfyUI's native"):
        require_native_minimax_h3(SimpleNamespace(model=SimpleNamespace(diffusion_model=torch.nn.Linear(2, 2))))


def test_model_detection_enforces_the_conditional_timestep_contract():
    assert is_native_minimax_h3(_native_shaped_fake(use_adaln_curves=False))
    assert is_native_minimax_h3(_native_shaped_fake(use_adaln_curves=True))

    missing_embedder = _native_shaped_fake(use_adaln_curves=False)
    del missing_embedder.time_embedder
    assert not is_native_minimax_h3(missing_embedder)

    missing_table = _native_shaped_fake(use_adaln_curves=True)
    del missing_table.adaln_t_table
    assert not is_native_minimax_h3(missing_table)


def test_state_residual_basis_round_trip_uses_exact_current_h3_input(monkeypatch):
    video_projection = torch.nn.Linear(1, 2, bias=False)
    audio_projection = torch.nn.Linear(1, 2, bias=False)
    with torch.no_grad():
        video_projection.weight.copy_(torch.tensor([[2.0], [3.0]]))
        audio_projection.weight.copy_(torch.tensor([[5.0], [7.0]]))

    inner = SimpleNamespace(
        hidden_size=2,
        patch_size=(1, 1, 1),
        video_patch_proj=video_projection,
        audio_patch_proj=audio_projection,
    )
    native_module = SimpleNamespace(
        patchify_video=lambda value, _patch: value.permute(0, 2, 3, 4, 1).reshape(-1, 1),
        pack_audio=lambda value: value.reshape(-1, 1),
    )
    common_dit = SimpleNamespace(
        pad_to_patch_size=lambda value, _patch: value,
    )
    monkeypatch.setattr(minimax_h3_module, "_native_module", lambda _inner: native_module)
    real_import = minimax_h3_module.importlib.import_module
    monkeypatch.setattr(
        minimax_h3_module.importlib,
        "import_module",
        lambda name: common_dit if name == "comfy.ldm.common_dit" else real_import(name),
    )

    video = torch.tensor([[[[[1.0, 2.0], [3.0, 4.0]]]]])
    audio = torch.tensor([[[[6.0, 8.0]]]])
    residual = torch.full((1, 6, 2), 11.0)

    reconstructed = residual.clone()
    _apply_exact_state_input_embedding_(
        reconstructed,
        inner,
        video,
        audio,
        scale=1.0,
    )
    recovered = reconstructed.clone()
    _apply_exact_state_input_embedding_(
        recovered,
        inner,
        video,
        audio,
        scale=-1.0,
    )

    torch.testing.assert_close(recovered, residual)
    assert not torch.equal(reconstructed, residual)


def test_non_native_diffusion_call_records_a_native_passthrough_fallback():
    runtime = SpectrumH3Runtime(SpectrumH3Config(degree=1, max_history=4))
    run_id = runtime.start_run(torch.tensor([1.0, 0.5, 0.0]), "sample_euler", supported_sampler=True)
    decision = runtime.begin_step(torch.tensor([1.0]))

    class Executor:
        class_obj = object()

        def __call__(self, *args, **kwargs):
            return "native-output"

    options = {
        RUNTIME_KEY: runtime,
        RUN_ID_KEY: decision["run_id"],
        STEP_ID_KEY: decision["step_id"],
    }
    result = diffusion_model_wrapper(Executor(), object(), torch.tensor([1000.0]), object(), options)
    runtime.finalize_step(decision["run_id"], decision["step_id"])

    assert result == "native-output"
    assert runtime.stats.actual_steps == 1
    assert "not ComfyUI's native MiniMax H3" in runtime.disabled_reason
    runtime.end_run(run_id)


def test_forecast_sanitization_clamps_and_replaces_nonfinite_values():
    source = torch.tensor([float("nan"), float("inf"), -float("inf"), 1e20, 2.0])
    sanitized, event = _sanitize_prediction(source, torch.float16)
    assert event is not None
    assert torch.isfinite(sanitized).all()
    assert sanitized.dtype == torch.float16
    all_bad, event = _sanitize_prediction(torch.tensor([float("nan"), float("inf")]), torch.float16)
    assert all_bad is None
    assert "no finite" in event["reason"]


def test_model_clone_callback_provisions_an_isolated_runtime():
    source_runtime = SpectrumH3Runtime(SpectrumH3Config(degree=1, max_history=4))
    source = SimpleNamespace(model_options={BINDING_KEY: SpectrumH3Binding(source_runtime)})
    clone = SimpleNamespace(model_options={BINDING_KEY: source.model_options[BINDING_KEY]})
    model_clone_callback(source, clone)
    clone_runtime = clone.model_options[BINDING_KEY].runtime
    assert clone_runtime is not source_runtime
    assert clone_runtime.config == source_runtime.config
