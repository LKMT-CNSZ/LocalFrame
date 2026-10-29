from __future__ import annotations

import importlib.util
import json
import math
import sys
from pathlib import Path

import pytest


_TOOL_PATH = Path(__file__).resolve().parents[1] / "tools" / "analyze_replay_calibration.py"
_SPEC = importlib.util.spec_from_file_location("spectrum_replay_calibration_tool", _TOOL_PATH)
assert _SPEC is not None and _SPEC.loader is not None
evaluator = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = evaluator
_SPEC.loader.exec_module(evaluator)


def _row(
    *,
    step: int,
    current_weight: float,
    disagreement: float,
    penalty: float,
    spectral_gap: float,
    coordinate: float,
    oracle_weight: float,
    trace: str,
) -> dict[str, object]:
    base = 0.5 + 0.01 * step
    oracle_weight = max(0.0, min(1.0, oracle_weight))
    row: dict[str, object] = {
        "schema_version": evaluator.SCHEMA_VERSION,
        "trace_fingerprint": trace,
        "target_step_id": step,
        "coordinate": coordinate,
        "local_error_sq_mean": base + oracle_weight * oracle_weight,
        "local_error_dot_spectral_delta_mean": -oracle_weight,
        "spectral_delta_sq_mean": 1.0,
        "ratio_denominator_rms": 1.0,
        "ratio_epsilon": 1e-6,
        "current_weight": current_weight,
        "causal_disagreement": disagreement,
        "validation_penalty": penalty,
        "spectral_gap": spectral_gap,
        "oracle_weight": oracle_weight,
        "row_compatible": True,
    }
    row["local_ratio"] = evaluator.ratio_from_row(row, 0.0)
    row["current_ratio"] = evaluator.ratio_from_row(row, current_weight)
    row["full_spectral_ratio"] = evaluator.ratio_from_row(row, 1.0)
    row["oracle_ratio"] = evaluator.ratio_from_row(row, oracle_weight)
    for weight in evaluator.FIXED_ABSOLUTE_WEIGHTS:
        row[f"fixed_{evaluator._fixed_suffix(weight)}_ratio"] = evaluator.ratio_from_row(
            row, weight
        )
    return row


def _block(label: str, offset: float = 0.0) -> dict[str, object]:
    trace = f"trace-{label}"
    rows = []
    for index, current in enumerate((0.15, 0.25, 0.35, 0.45, 0.55)):
        disagreement = 0.1 + 0.12 * index + offset
        penalty = 1.5 - 0.08 * index + 0.1 * offset
        spectral_gap = 0.2 + 0.03 * index + 0.05 * offset
        coordinate = -0.8 + 0.4 * index
        oracle = 0.08 + 0.45 * current + 0.30 * disagreement
        rows.append(
            _row(
                step=2 + index * 2,
                current_weight=current,
                disagreement=disagreement,
                penalty=penalty,
                spectral_gap=spectral_gap,
                coordinate=coordinate,
                oracle_weight=oracle,
                trace=trace,
            )
        )
    return {
        "schema_version": evaluator.SCHEMA_VERSION,
        "kind": "spectrum_h3_replay_calibration",
        "provenance": {
            "trace_fingerprint": trace,
            "seed": None,
            "label": label,
        },
        "metadata": {
            "compatible": True,
            "parity_tolerance": evaluator.DEFAULT_PARITY_TOLERANCE,
        },
        "target_rows": rows,
    }


def _run(label: str, offset: float = 0.0):
    block = _block(label, offset)
    evaluator.validate_block(block)
    return evaluator.RunBlock(label, 0, label, None, block)


def test_exact_moment_parity_and_fail_loudly_on_drift():
    block = _block("a")
    result = evaluator.validate_block(block)
    assert result["rows"] == 5
    assert result["max_parity_abs_error"] < 1e-12

    broken = json.loads(json.dumps(block))
    broken["target_rows"][0]["current_ratio"] += 1e-3
    with pytest.raises(evaluator.CalibrationError, match="metric parity failed"):
        evaluator.validate_block(broken)


def test_json_and_full_log_parsing():
    block = _block("a")
    direct = evaluator.parse_calibration_text(json.dumps(block))
    assert direct == [block]
    log = (
        "prefix normal log\n"
        f"WARNING summary {evaluator.LOG_PREFIX}{json.dumps(block, separators=(',', ':'))}\n"
        "suffix\n"
    )
    parsed = evaluator.parse_calibration_text(log)
    assert parsed == [block]


def test_cli_annotation_loading(tmp_path):
    path = tmp_path / "run.log"
    block = _block("runtime-label")
    path.write_text(
        f"summary {evaluator.LOG_PREFIX}{json.dumps(block, separators=(',', ':'))}\n",
        encoding="utf-8",
    )
    runs = evaluator.load_runs(
        [str(path)],
        label_specs=["external-label"],
        seed_specs=["123456789"],
    )
    assert len(runs) == 1
    assert runs[0].label == "external-label"
    assert runs[0].seed == 123456789
    assert runs[0].runtime_seed is None


def test_runtime_seed_conflict_is_rejected(tmp_path):
    path = tmp_path / "run.log"
    block = _block("runtime-label")
    block["provenance"]["seed"] = 123
    path.write_text(json.dumps(block), encoding="utf-8")
    with pytest.raises(evaluator.CalibrationError, match="conflicts with runtime seed"):
        evaluator.load_runs([str(path)], seed_specs=["456"])


def test_duplicate_trace_cannot_be_counted_twice_as_independent_evidence():
    first = _run("a")
    duplicate = evaluator.RunBlock(
        source="copy.log",
        block_index=0,
        label="copy",
        seed=None,
        block=json.loads(json.dumps(first.block)),
    )
    with pytest.raises(evaluator.CalibrationError, match="duplicate calibration run identity"):
        evaluator.analyze_runs([first, duplicate])


def test_external_seed_can_disambiguate_unknown_runtime_trace_identity():
    block = _block("a")
    first = evaluator.RunBlock("a.log", 0, "a", 1, block)
    second = evaluator.RunBlock(
        "b.log",
        0,
        "b",
        2,
        json.loads(json.dumps(block)),
    )
    evaluator._validate_run_collection([first, second])
    assert first.analysis_identity != second.analysis_identity


def test_duplicate_labels_are_rejected_before_fold_caches_are_built():
    first = _run("a")
    second_block = _block("b")
    second = evaluator.RunBlock("b", 0, "a", None, second_block)
    with pytest.raises(evaluator.CalibrationError, match="duplicate run label"):
        evaluator.analyze_runs([first, second])


def test_level0_affine_level1_and_level2_hierarchy():
    runs = [_run("a", 0.00), _run("b", 0.03), _run("c", -0.02)]
    report = evaluator.analyze_runs(runs)
    assert report["evidence_level"].startswith("MULTI-RUN")
    assert report["aggregate_weighting"] == "per-target across held-out complete runs"
    assert set(report["level0"]) >= {
        "local",
        "current",
        "alpha_0p00",
        "alpha_0p25",
        "alpha_0p50",
        "alpha_0p75",
        "alpha_1p00",
    }
    assert "affine_current_weight" in report["level1"]
    assert set(report["level2"]) == set(evaluator.LEVEL2_PREDICTORS)
    disagreement = report["level2"]["causal_disagreement"]
    assert "vs_level1_aggregate" in disagreement
    assert "vs_coordinate_control_aggregate" in disagreement
    assert disagreement["aggregate_held_out"]["ratio_mean"] < report["level1"][
        "affine_current_weight"
    ]["aggregate_held_out"]["ratio_mean"]
    assert disagreement["vs_level1_aggregate"]["ratio_mean_delta"] < 0.0


def test_cross_validation_uses_complete_runs_only():
    runs = [_run("a", 0.00), _run("b", 0.03), _run("c", -0.02)]
    report = evaluator.analyze_runs(runs)
    folds = report["level1"]["affine_current_weight"]["folds"]
    assert len(folds) == 3
    for fold in folds:
        assert fold["held_out_run"] not in fold["training_runs"]
        assert len(fold["training_runs"]) == 2
        assert fold["in_sample_development"] is False
    for entry in report["level2"].values():
        assert [fold["held_out_run"] for fold in entry["folds"]] == [
            "a",
            "b",
            "c",
        ]


def test_held_out_run_cannot_change_its_training_coefficients():
    runs = [_run("a", 0.00), _run("b", 0.03), _run("c", -0.02)]
    first = evaluator.analyze_runs(runs)

    mutated_block = _block("a", 0.00)
    for row in mutated_block["target_rows"]:
        current = float(row["current_weight"])
        disagreement = float(row["causal_disagreement"])
        replacement = min(0.95, 0.7 + 0.1 * current + 0.05 * disagreement)
        updated = _row(
            step=int(row["target_step_id"]),
            current_weight=current,
            disagreement=disagreement,
            penalty=float(row["validation_penalty"]),
            spectral_gap=float(row["spectral_gap"]),
            coordinate=float(row["coordinate"]),
            oracle_weight=replacement,
            trace="trace-a",
        )
        row.clear()
        row.update(updated)
    mutated = evaluator.RunBlock("a", 0, "a", None, mutated_block)
    second = evaluator.analyze_runs([mutated, runs[1], runs[2]])

    def held_out_coefficients(report, level, name):
        entry = report[level][name]
        return next(
            fold["coefficients"]
            for fold in entry["folds"]
            if fold["held_out_run"] == "a"
        )

    assert held_out_coefficients(
        first, "level1", "affine_current_weight"
    ) == held_out_coefficients(second, "level1", "affine_current_weight")
    assert held_out_coefficients(
        first, "level2", "causal_disagreement"
    ) == held_out_coefficients(second, "level2", "causal_disagreement")


def test_evidence_labels_for_one_two_and_three_runs():
    one = evaluator.analyze_runs([_run("a")])
    two = evaluator.analyze_runs([_run("a"), _run("b", 0.03)])
    three = evaluator.analyze_runs(
        [_run("a"), _run("b", 0.03), _run("c", -0.02)]
    )
    assert one["evidence_level"] == "NON-CONFIRMATORY / DEVELOPMENT ONLY"
    assert two["evidence_level"] == "WEAK / PRELIMINARY"
    assert three["evidence_level"].startswith("MULTI-RUN")


def test_fit_objective_is_fixed_auditable_and_unscaled():
    rows = _run("a").rows
    names, coefficients = evaluator.fit_quadratic_linear(
        rows, extra_predictor="causal_disagreement"
    )
    assert names == ["intercept", "current_weight", "causal_disagreement"]
    assert all(math.isfinite(value) for value in coefficients)
    report = evaluator.analyze_runs([_run("a")])
    assert "no feature normalization" in report["fit_objective"]
    assert f"fixed ridge={evaluator.FIT_RIDGE:g}" in report["fit_objective"]


def test_residual_correlation_interpretation_is_replication_aware():
    assert evaluator.residual_bucket(0.49) == "weak"
    assert evaluator.residual_bucket(-0.55) == "indeterminate/noise-floor"
    assert evaluator.residual_bucket(0.61) == "candidate-structure"
    report = evaluator.analyze_runs([_run("a"), _run("b", 0.03)])
    residual = report["residual_structure_alpha_0p50"]
    assert "not formal significance" in residual["interpretation"]
    assert len(residual["per_run"]) == 2


def test_report_is_deterministic():
    runs = [_run("a"), _run("b", 0.03)]
    first = evaluator.analyze_runs(runs)
    second = evaluator.analyze_runs(runs)
    assert json.dumps(first, sort_keys=True, allow_nan=False) == json.dumps(
        second, sort_keys=True, allow_nan=False
    )
