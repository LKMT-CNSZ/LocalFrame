from __future__ import annotations

import ast
import os
import sys
from pathlib import Path
from types import FunctionType, ModuleType, SimpleNamespace

import pytest

from comfyui_spectrum_h3.sampling import sampler_supports_seeded_replay


NATIVE_SCALER_MODULE = "comfy_extras.nodes_custom_sampler"


def _er_sde_sampler(**options):
    def sample_er_sde():
        pass

    return SimpleNamespace(sampler_function=sample_er_sde, extra_options=options)


def _install_native_sampler_er_sde_module(monkeypatch, eta: float = 0.75):
    module = ModuleType(NATIVE_SCALER_MODULE)
    exec(
        """
class SamplerER_SDE:
    @classmethod
    def execute(cls, eta):
        def er_sde_noise_scaler(x):
            return x + eta

        def reverse_time_sde_noise_scaler(x):
            return x ** (eta + 1)

        def ode_noise_scaler(x):
            return x

        return {
            "er_sde_noise_scaler": er_sde_noise_scaler,
            "reverse_time_sde_noise_scaler": reverse_time_sde_noise_scaler,
            "ode_noise_scaler": ode_noise_scaler,
        }
""",
        module.__dict__,
    )
    monkeypatch.setitem(sys.modules, NATIVE_SCALER_MODULE, module)
    return module.SamplerER_SDE.execute(eta)


def _closure_cell(value):
    def capture():
        return value

    return capture.__closure__[0]


def _body_dump(body: list[ast.stmt]) -> str:
    return ast.dump(ast.Module(body=body, type_ignores=[]), include_attributes=False)


def _reviewed_body(source: str) -> str:
    function = ast.parse(f"def scaler(x):\n    {source}\n").body[0]
    assert isinstance(function, ast.FunctionDef)
    return _body_dump(function.body)


REVIEWED_SCALER_BODIES = {
    "er_sde_noise_scaler": _reviewed_body(
        "return x * ((x ** 0.3).exp() + 10.0) ** eta"
    ),
    "reverse_time_sde_noise_scaler": _reviewed_body("return x ** (eta + 1)"),
    "ode_noise_scaler": _reviewed_body("return x"),
}


@pytest.mark.parametrize(
    "scaler_name",
    (
        "er_sde_noise_scaler",
        "reverse_time_sde_noise_scaler",
        "ode_noise_scaler",
    ),
)
def test_native_sampler_er_sde_scalers_are_seeded_replay_safe(monkeypatch, scaler_name):
    native_scalers = _install_native_sampler_er_sde_module(monkeypatch)
    sampler = _er_sde_sampler(
        s_noise=0.8,
        max_stage=3,
        noise_scaler=native_scalers[scaler_name],
    )

    assert sampler_supports_seeded_replay(sampler)


def test_custom_er_sde_noise_sampler_remains_replay_unsafe():
    sampler = _er_sde_sampler(noise_sampler=lambda *_args: None)

    assert not sampler_supports_seeded_replay(sampler)


def test_unknown_er_sde_noise_scaler_remains_replay_unsafe():
    sampler = _er_sde_sampler(noise_scaler=lambda value: value)

    assert not sampler_supports_seeded_replay(sampler)


def test_native_metadata_and_globals_spoof_with_different_code_fails_closed(monkeypatch):
    native_scalers = _install_native_sampler_er_sde_module(monkeypatch)
    eta = 0.75

    def spoofed_er_sde_noise_scaler(x):
        return x * eta

    trusted_globals = native_scalers["er_sde_noise_scaler"].__globals__
    spoofed = FunctionType(
        spoofed_er_sde_noise_scaler.__code__,
        trusted_globals,
        name="er_sde_noise_scaler",
        closure=spoofed_er_sde_noise_scaler.__closure__,
    )
    spoofed.__module__ = NATIVE_SCALER_MODULE
    spoofed.__qualname__ = "SamplerER_SDE.execute.<locals>.er_sde_noise_scaler"
    assert spoofed.__code__.co_freevars == ("eta",)

    sampler = _er_sde_sampler(noise_scaler=spoofed)

    assert not sampler_supports_seeded_replay(sampler)


def test_native_scaler_code_with_mutable_closure_state_fails_closed(monkeypatch):
    native_scalers = _install_native_sampler_er_sde_module(monkeypatch)
    native = native_scalers["er_sde_noise_scaler"]
    forged = FunctionType(
        native.__code__,
        native.__globals__,
        name=native.__name__,
        closure=(_closure_cell([]),),
    )
    forged.__module__ = native.__module__
    forged.__qualname__ = native.__qualname__
    sampler = _er_sde_sampler(noise_scaler=forged)

    assert not sampler_supports_seeded_replay(sampler)


def test_comfyui_sampler_er_sde_wires_only_reviewed_native_scaler_closures():
    comfyui_path = os.environ.get("COMFYUI_PATH")
    if not comfyui_path:
        pytest.skip("COMFYUI_PATH is required for native sampler contract tests")

    source = Path(comfyui_path) / "comfy_extras/nodes_custom_sampler.py"
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    sampler_class = next(
        node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "SamplerER_SDE"
    )
    execute = next(
        node
        for node in sampler_class.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "execute"
    )

    local_scalers = {
        node.name: node
        for node in execute.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    assert local_scalers
    assert set(local_scalers) <= set(REVIEWED_SCALER_BODIES)
    for name, scaler in local_scalers.items():
        assert _body_dump(scaler.body) == REVIEWED_SCALER_BODIES[name]

    ksampler_call = next(
        call
        for call in ast.walk(execute)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Attribute)
        and call.func.attr == "ksampler"
    )
    assert len(ksampler_call.args) >= 2
    options = ksampler_call.args[1]
    assert isinstance(options, ast.Dict)
    option_map = {
        key.value: value
        for key, value in zip(options.keys, options.values)
        if isinstance(key, ast.Constant) and isinstance(key.value, str)
    }
    assert set(option_map) == {"s_noise", "noise_scaler", "max_stage"}
    assert isinstance(option_map["noise_scaler"], ast.Name)
    assert option_map["noise_scaler"].id == "noise_scaler"
    assert "noise_sampler" not in option_map
