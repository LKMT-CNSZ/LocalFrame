from __future__ import annotations

import torch

from comfyui_spectrum_h3.config import SpectrumH3Config
from comfyui_spectrum_h3.runtime import SpectrumH3Runtime


def _run_er_sde_schedule(
    total_steps: int,
    *,
    tail_actual_steps: int = 1,
    offline: bool = True,
) -> tuple[list[dict[str, object]], SpectrumH3Runtime]:
    runtime = SpectrumH3Runtime(
        SpectrumH3Config(
            model_aware_mode="off",
            offline_smoothing_replay=offline,
            warmup_steps=1,
            tail_actual_steps=tail_actual_steps,
            bootstrap_first_forecast=True,
        )
    )
    sigmas = torch.linspace(1.0, 0.0, total_steps + 1)
    if offline:
        runtime.begin_offline_capture(
            total_steps=total_steps,
            sampler_name="sample_er_sde",
        )
    run_id = runtime.start_run(
        sigmas,
        "sample_er_sde",
        supported_sampler=True,
        max_consecutive_forecasts=1,
        min_actual_steps_after_forecast=1,
        min_tail_actual_steps=0,
    )

    decisions: list[dict[str, object]] = []
    for step_id in range(total_steps):
        decision = runtime.begin_step(sigmas[step_id])
        decisions.append(decision)
        call_id, actual = runtime.begin_model_call(
            run_id,
            step_id,
            topology=("tiny",),
            labels=("cond",),
            expected_shape=(1, 2, 1),
        )
        if actual:
            runtime.observe_actual(
                run_id,
                step_id,
                call_id,
                torch.full((1, 2, 1), float(step_id), dtype=torch.float32),
            )
        else:
            # This is a scheduler-policy test. Mark the single forecast call as a
            # completed forecast transaction without exercising forecaster math.
            assert runtime._step is not None
            runtime._step.calls[call_id].used_forecast = True
            runtime._step.used_history_rows.add(0)
        runtime.finalize_step(run_id, step_id)

    return decisions, runtime


def _actual_indices(decisions: list[dict[str, object]]) -> list[int]:
    return [
        int(decision["step_id"])
        for decision in decisions
        if bool(decision["actual"])
    ]


def _assert_exact_nfe_accounting(
    decisions: list[dict[str, object]], runtime: SpectrumH3Runtime
) -> None:
    actual_count = sum(bool(decision["actual"]) for decision in decisions)
    forecast_count = len(decisions) - actual_count
    assert runtime.stats.actual_steps == actual_count
    assert runtime.stats.forecast_steps == forecast_count
    assert runtime.stats.actual_transformer_calls == actual_count
    assert runtime.stats.forecast_model_calls == forecast_count
    assert runtime.stats.actual_steps + runtime.stats.forecast_steps == len(decisions)


def test_er_sde_20_step_schedule_gets_no_unnecessary_tail_promotion() -> None:
    decisions, runtime = _run_er_sde_schedule(20)

    assert bool(decisions[18]["actual"])
    assert _actual_indices(decisions) == [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 19]
    assert runtime.stats.actual_steps == 11
    assert runtime.stats.forecast_steps == 9
    _assert_exact_nfe_accounting(decisions, runtime)


def test_er_sde_25_step_penultimate_forecast_is_promoted_for_offline_replay() -> None:
    decisions, runtime = _run_er_sde_schedule(25)

    assert [bool(decisions[index]["actual"]) for index in (22, 23, 24)] == [
        True,
        True,
        True,
    ]
    assert decisions[23]["reason"] == "final actual tail"
    assert runtime.stats.actual_steps == 14
    assert runtime.stats.forecast_steps == 11
    assert runtime.stats.actual_transformer_calls == 14
    _assert_exact_nfe_accounting(decisions, runtime)


def test_er_sde_32_step_schedule_gets_no_unnecessary_tail_promotion() -> None:
    decisions, runtime = _run_er_sde_schedule(32)

    assert bool(decisions[30]["actual"])
    assert runtime.stats.actual_steps == 17
    assert runtime.stats.forecast_steps == 15
    _assert_exact_nfe_accounting(decisions, runtime)


def test_er_sde_explicit_larger_tail_still_wins() -> None:
    decisions, runtime = _run_er_sde_schedule(25, tail_actual_steps=4)

    assert all(bool(decisions[index]["actual"]) for index in range(21, 25))
    assert all(
        decisions[index]["reason"] == "final actual tail" for index in range(21, 25)
    )
    _assert_exact_nfe_accounting(decisions, runtime)


def test_er_sde_offline_terminal_schedule_keeps_future_exact_anchor() -> None:
    decisions, runtime = _run_er_sde_schedule(25)
    actual_indices = _actual_indices(decisions)

    assert actual_indices[-1] == 24
    for decision in decisions:
        if not bool(decision["actual"]):
            assert any(index > int(decision["step_id"]) for index in actual_indices)
    assert runtime._offline_archive is not None
    assert [record.actual for record in runtime._offline_archive.steps] == [
        bool(decision["actual"]) for decision in decisions
    ]
    _assert_exact_nfe_accounting(decisions, runtime)


def test_er_sde_single_pass_keeps_normal_penultimate_decision() -> None:
    decisions, runtime = _run_er_sde_schedule(25, offline=False)

    assert not bool(decisions[23]["actual"])
    assert bool(decisions[24]["actual"])
    assert runtime.stats.actual_steps == 13
    assert runtime.stats.forecast_steps == 12
    _assert_exact_nfe_accounting(decisions, runtime)
