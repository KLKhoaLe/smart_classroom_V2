# Manual actuator levels — contract for Khoa/Vinh review

Built against main `885ccc3892c015cab2cf2b78da32f94306d12a84` (23 Oct 2026).

- Frontend → NestJS `/api/commands/manual` → WF03 → `/api/automation/resolve` → guarded dispatch → HTTP simulator claim → ACK.
- Optional `level`: FAN integer 0..3; LIGHT integer 0..100. `OFF` requires 0; `ON` requires a positive level. VENTILATION/DEHUMIDIFIER remain ON/OFF.
- A light command level is lamp output, not the `light_percent` sensor measurement.
- `device_commands.level`, `manual_overrides.level`, `device_states.desired_level/actual_level` are nullable. Existing state has unknown level until a valid ACK reports it; migration does not invent actual values.
- New requests carry levels. Changing FAN 1→3 while ON creates a new command. The simulator ACK carries `actual_levels: {FAN: 3, LIGHT: 70}`. If a command has a level, SUCCESS requires that exact level as well as matching ON/OFF.
- Legacy ON/OFF commands continue to work. The simulator uses FAN 3 / LIGHT 100 for legacy ON and 0 for OFF. AUTO decisions remain the existing ON/OFF contract; this PR does not add AI level selection.
- For frontend requests with a level, backend saves an intent event before forwarding to WF03. Resolve rejects a workflow that drops/changes the requested level. Import the updated WF03 JSON; its level mode supports BACKEND dispatch only. FLOW04/MQTT needs a separate agreed extension and is rejected for level requests.
- `manual_levels_enabled` in dashboard confirms backend level support. UI disables level controls when absent. Actual level is never updated optimistically.

## Return AUTO

Uses Vinh's existing `DELETE /api/overrides/:device/:type`. Frontend sends `expected_id` and `expected_expires_at` to avoid releasing a newer hold. Transaction uses the device lock shared with resolve/claim/ACK, removes the hold, cancels PENDING/QUEUED MANUAL commands for that actuator, and logs MANUAL_RELEASED. SENT commands remain eligible for ACK; AUTO waits for the existing command rules. No fabricated ACK or immediate OFF is created.

Review: Khoa — WF03 + simulator level semantics. Vinh — additive migration, API and transaction behavior. Keep existing AuthService, RBAC, and app.module registrations. Part 1 repairs the malformed merged app.module.ts/api.controller.ts and preserves monitoring, auth, automation, and incident/report services. Part 2 restores executable Code nodes in the supplied WF03 JSON. WF01/02 code nodes in current main also contain placeholders; their restoration is outside this manual frontend test and needs Khoa review.
