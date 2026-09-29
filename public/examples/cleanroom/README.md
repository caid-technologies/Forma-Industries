# Cleanroom POC Example

This bundled Mergence scene is a local architectural visualization and schedule demo. It is opened with `/?scene=cleanroom`; that route does not replace the user's saved workspace.

The example models four 20 ft rooms within an 80 ft square, 20 ft perimeter corridors, four cleanroom workbenches, and one Form swab-sampling robot. The illustrative A/B/C schedule is in `sampling-plan.json`; Room B is deliberately skipped while marked occupied. Confirm access, sample targets, egress, HVAC, classification, and fabrication requirements before real operation. The STEP robot is a mostly fused CAD pose, so its sampling contact is approximated with a short whole-robot approach/retract.

The robot and workbench STEP geometry comes from the `form-cleanroom-swab-bot` and `form-cleanroom-desk` Form OSS projects. Both projects declare their mechanical CAD under CERN-OHL-S-2.0; see their source project documentation for license terms and provenance.

Regenerate the bundled room geometry and robot timeline from Form Industries with `node --import tsx scripts/build-cleanroom-example.mjs`.
