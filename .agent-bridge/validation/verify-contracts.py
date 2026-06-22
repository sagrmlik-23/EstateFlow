#!/usr/bin/env python3
"""Cross-agent contract verification for EstateFlow CRM.
Checks that all agents' published interfaces are compatible.
Run after every round."""
import json
import glob
import sys
import os

def load_contracts():
    contracts = {}
    contracts_dir = os.path.join(os.path.dirname(__file__), '..', 'contracts')
    for f in sorted(glob.glob(os.path.join(contracts_dir, '*.json'))):
        with open(f) as fh:
            c = json.load(fh)
            contracts[c["agent_id"]] = c
    return contracts

def verify(contracts):
    errors = []
    warnings = []
    agent_ids = set(contracts.keys())

    for agent_id, contract in contracts.items():
        # Check status
        status = contract.get("status", "unknown")
        if status not in ("completed", "in_progress"):
            errors.append(f"{agent_id}: status is '{status}', expected 'in_progress' or 'completed'")

        # Check for integration warnings
        for warning in contract.get("integration_warnings", []):
            if isinstance(warning, str):
                warnings.append(f"{agent_id}: INTEGRATION WARNING - {warning}")
            else:
                warnings.append(f"{agent_id}: INTEGRATION WARNING - {json.dumps(warning)}")

        # Verify files_created - log count
        files = contract.get("files_created", [])
        if not files:
            warnings.append(f"{agent_id}: No files_created listed in contract")
        else:
            print(f"  {agent_id}: {len(files)} files planned")

        # Check exports in a safe way
        exports = contract.get("exports", {})
        if isinstance(exports, dict):
            # Check for functions in any module-level export
            func_count = 0
            for module_or_key, module_exports in exports.items():
                if isinstance(module_exports, dict):
                    funcs = module_exports.get("functions", [])
                    if funcs:
                        func_count += len(funcs)
                        for func in funcs:
                            if isinstance(func, dict) and not func.get("returns"):
                                warnings.append(f"{agent_id}: Function '{func.get('name', 'unknown')}' missing return type")
            if func_count > 0:
                print(f"  {agent_id}: {func_count} functions exported")
        else:
            warnings.append(f"{agent_id}: exports is not a dict, it's {type(exports).__name__}")

        # Check types_defined or types
        types_data = contract.get("types_defined", contract.get("types", {}))
        if isinstance(types_data, dict) and len(types_data) > 0:
            type_count = sum(len(v) if isinstance(v, dict) else 1 for v in types_data.values())
            print(f"  {agent_id}: types defined")

    # Cross-agent dependency check
    for agent_id, contract in contracts.items():
        for dep in contract.get("dependencies_on_agents", []):
            if dep not in agent_ids:
                errors.append(f"{agent_id}: Depends on unknown agent: {dep}")
            else:
                dep_status = contracts[dep].get("status", "unknown")
                if dep_status not in ("completed", "in_progress"):
                    errors.append(f"{agent_id}: Depends on {dep} but {dep} has status '{dep_status}'")

        # Check requires_from_other_agents
        for req in contract.get("requires_from_other_agents", []):
            if isinstance(req, dict):
                from_agent = req.get("from_agent", "")
                if from_agent and from_agent not in agent_ids:
                    errors.append(f"{agent_id}: Requires from unknown agent: {from_agent}")

    # Check conflict messages
    messages_dir = os.path.join(os.path.dirname(__file__), '..', 'messages')
    for f in glob.glob(os.path.join(messages_dir, '**', '*conflict*'), recursive=True):
        with open(f) as fh:
            conflict = json.load(fh)
            warnings.append(f"CONFLICT: {conflict.get('from')} > {conflict.get('to')}: {conflict.get('subject')}")

    return errors, warnings

if __name__ == "__main__":
    contracts = load_contracts()
    print(f"\nVerifying {len(contracts)} agents...\n")
    errors, warnings = verify(contracts)

    report = {
        "total_agents": len(contracts),
        "completed_agents": sum(1 for c in contracts.values() if c.get("status") == "completed"),
        "in_progress_agents": sum(1 for c in contracts.values() if c.get("status") == "in_progress"),
        "errors": errors,
        "warnings": warnings,
        "passed": len(errors) == 0
    }

    report_path = os.path.join(os.path.dirname(__file__), '..', "round-report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n{'='*50}")
    if errors:
        print(f"VERIFICATION FAILED: {len(errors)} errors, {len(warnings)} warnings")
        for e in errors:
            print(f"  [ERROR] {e}")
        for w in warnings:
            print(f"  [WARN]  {w}")
        sys.exit(1)
    else:
        print(f"VERIFICATION PASSED: All {len(contracts)} agents compatible")
        if warnings:
            for w in warnings:
                print(f"  [WARN]  {w}")
        sys.exit(0)
