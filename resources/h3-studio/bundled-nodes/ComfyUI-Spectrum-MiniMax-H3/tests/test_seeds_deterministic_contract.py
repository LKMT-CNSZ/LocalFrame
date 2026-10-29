from __future__ import annotations

import ast
import copy
import os
from functools import partial
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch


def _native_seeds_function(function_name: str):
    comfyui_path = os.environ.get("COMFYUI_PATH")
    if not comfyui_path:
        pytest.skip("COMFYUI_PATH is required for the native SEEDS contract test")
    source_path = Path(comfyui_path) / "comfy/k_diffusion/sampling.py"
    tree = ast.parse(source_path.read_text(encoding="utf-8"), filename=str(source_path))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == function_name
    )
    function = copy.deepcopy(function)
    function.decorator_list = []
    module = ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[]))
    namespace = {
        "torch": torch,
        "trange": lambda count, disable=None: range(count),
        "partial": partial,
        "default_noise_sampler": object(),
        "offset_first_sigma_for_snr": lambda sigmas, _model_sampling: sigmas,
        "sigma_to_half_log_snr": lambda sigma, model_sampling: -torch.log(sigma),
        "half_log_snr_to_sigma": lambda value, model_sampling: torch.exp(-value),
        "ei_h_phi_1": torch.expm1,
        "ei_h_phi_2": lambda value: (torch.expm1(value) - value) / value,
    }
    exec(  # noqa: S102 - execute reviewed native source in a closed test namespace
        compile(module, f"<native {function_name}>", "exec"),
        namespace,
    )
    return namespace[function_name]


def _run_native(
    function_name: str,
    *,
    eta: float,
    s_noise: float,
    noise_value: float,
):
    native = _native_seeds_function(function_name)
    model_sampling = SimpleNamespace(noise_scale=1.0)
    model_calls = 0
    noise_calls = 0

    class Patcher:
        def get_model_object(self, name):
            assert name == "model_sampling"
            return model_sampling

    class Model:
        inner_model = SimpleNamespace(model_patcher=Patcher())

        def __call__(self, x, sigma, **_extra_args):
            nonlocal model_calls
            model_calls += 1
            sigma_view = sigma.reshape(-1, *([1] * (x.ndim - 1)))
            return x * 0.2 + sigma_view * 0.1

    def noise_sampler(_sigma, _sigma_next):
        nonlocal noise_calls
        noise_calls += 1
        return torch.full((1, 2), noise_value, dtype=torch.float32)

    sigmas = torch.tensor([0.9, 0.7, 0.5, 0.0], dtype=torch.float32)
    result = native(
        Model(),
        torch.ones((1, 2), dtype=torch.float32),
        sigmas,
        disable=True,
        eta=eta,
        s_noise=s_noise,
        noise_sampler=noise_sampler,
    )
    return result, model_calls, noise_calls


@pytest.mark.parametrize(
    ("function_name", "expected_model_calls"),
    (
        ("sample_seeds_2", 5),
        ("sample_seeds_3", 7),
    ),
)
@pytest.mark.parametrize(
    ("eta", "s_noise"),
    (
        (0.0, 1.0),
        (1.0, 0.0),
        (-0.5, 1.0),
    ),
)
def test_native_deterministic_seeds_keeps_multistage_calls_but_never_draws_noise(
    function_name,
    expected_model_calls,
    eta,
    s_noise,
):
    _, model_calls, noise_calls = _run_native(
        function_name,
        eta=eta,
        s_noise=s_noise,
        noise_value=123.0,
    )

    assert model_calls == expected_model_calls
    assert noise_calls == 0


@pytest.mark.parametrize(
    ("function_name", "expected_noise_calls"),
    (
        ("sample_seeds_2", 4),
        ("sample_seeds_3", 6),
    ),
)
def test_native_default_stochastic_seeds_draws_noise_between_model_calls(
    function_name,
    expected_noise_calls,
):
    _, _, noise_calls = _run_native(
        function_name,
        eta=1.0,
        s_noise=1.0,
        noise_value=0.25,
    )

    assert noise_calls == expected_noise_calls


@pytest.mark.parametrize("function_name", ("sample_seeds_2", "sample_seeds_3"))
def test_deterministic_seeds_output_is_independent_of_noise_sampler_values(function_name):
    first, first_calls, first_noise_calls = _run_native(
        function_name,
        eta=0.0,
        s_noise=1.0,
        noise_value=-1000.0,
    )
    second, second_calls, second_noise_calls = _run_native(
        function_name,
        eta=0.0,
        s_noise=1.0,
        noise_value=1000.0,
    )

    assert first_calls == second_calls
    assert first_noise_calls == second_noise_calls == 0
    assert torch.equal(first, second)
