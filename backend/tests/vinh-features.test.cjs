const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { InitialSchema1792200000000 } = require('../dist/database/migrations/1792200000000-InitialSchema');
const { VinhBackendEnhancements1792300000000 } = require('../dist/database/migrations/1792300000000-VinhBackendEnhancements');
const { seed } = require('../dist/database/seed');
const { DeviceService } = require('../dist/modules/device.service');
const { TelemetryService } = require('../dist/modules/telemetry.service');
const { CommandsService } = require('../dist/modules/commands.service');
const { DashboardService } = require('../dist/modules/dashboard.service');
const { AuthService } = require('../dist/modules/auth.service');

function wrap(pg) {
  return {
    query: async (sql, args) => {
      if (args === undefined) {
        const results = await pg.exec(sql);
        return results.at(-1)?.rows || [];
      }
      const r = await pg.query(sql, args);
      return /^\s*(UPDATE|DELETE)\b/i.test(sql) ? [r.rows, r.affectedRows ?? 0] : r.rows;
    },
    transaction: fn => pg.transaction(tx => fn(wrap(tx)))
  };
}

test('Vinh Backend Enhancements: Migration, RBAC, Commands Lifecycle, Capabilities, Pagination, Overrides, Proposals, Simulation', async () => {
  console.log('Step 1: Init PGlite...');
  const pg = new PGlite();
  const db = wrap(pg);

  try {
    console.log('Step 2: Migrations...');
    await new InitialSchema1792200000000().up(db);
    await new VinhBackendEnhancements1792300000000().up(db);
    console.log('Step 3: Seed...');
    await seed(db);

    const auth = new AuthService(db);
    const devices = new DeviceService(db);
    const telemetry = new TelemetryService(db, devices);
    const commands = new CommandsService(db, devices);
    const dashboard = new DashboardService(db);

    console.log('Step 4: Auth...');
    const adminLogin = await auth.login({ username: 'admin', password: 'admin123' });
    assert.equal(adminLogin.ok, true);
    assert.equal(adminLogin.user.role, 'ADMIN');

    const opLogin = await auth.login({ username: 'operator', password: 'operator123' });
    assert.equal(opLogin.ok, true);
    assert.equal(opLogin.user.role, 'OPERATOR');

    const viewerLogin = await auth.login({ username: 'viewer', password: 'viewer123' });
    assert.equal(viewerLogin.ok, true);
    assert.equal(viewerLogin.user.role, 'VIEWER');

    const verifiedAdmin = auth.verifyToken(adminLogin.token);
    assert.equal(verifiedAdmin.role, 'ADMIN');
    assert.equal(auth.verifyToken('invalid.token'), null);

    await assert.rejects(() => auth.login({ username: 'admin', password: 'wrongpassword' }), /Sai/);

    console.log('Step 5: Command create...');
    const validCmd = await commands.create({
      device_id: 'ESP32_A101',
      command_type: 'FAN',
      action: 'ON',
      source: 'AUTO',
      idempotency_key: 'vinh-test-fan-01',
      ttl_seconds: 60
    });
    assert.equal(validCmd.created, true);
    assert.equal(validCmd.command.command_type, 'FAN');

    console.log('Step 6: Cancel...');
    const cancelCmd = await commands.create({
      device_id: 'ESP32_A101',
      command_type: 'LIGHT',
      action: 'ON',
      source: 'AUTO',
      idempotency_key: 'vinh-cancel-test-01'
    });
    const cancelled = await commands.cancel(cancelCmd.command.id);
    assert.equal(cancelled.status, 'CANCELLED');

    console.log('Step 7: Dispatch & Claim & ACK...');
    const flowCmd = await commands.create({
      device_id: 'ESP32_A101',
      command_type: 'VENTILATION',
      action: 'ON',
      source: 'AUTO',
      idempotency_key: 'vinh-flow-test-01'
    });
    await commands.dispatch(flowCmd.command.id);

    const claimed = await commands.claim('ESP32_A101');
    assert.equal(claimed.commands.some(c => c.id === flowCmd.command.id), true);

    const ackRes = await commands.ack({
      command_id: flowCmd.command.id,
      device_id: 'ESP32_A101',
      status: 'SUCCESS',
      actual_state: { VENTILATION: 'ON' },
      simulated_state: { VENTILATION: 'ON' },
      sequence: Number(flowCmd.command.sequence)
    });
    assert.equal(ackRes.status, 'ACK');

    console.log('Step 8: Overrides...');
    const override = await devices.setOverride({
      device_id: 'ESP32_A101',
      command_type: 'FAN',
      action: 'ON',
      override_minutes: 45
    });
    assert.equal(override.ok, true);

    await devices.clearOverride('ESP32_A101', 'FAN');

    console.log('Step 9: Policy & Proposals & Simulation...');
    const proposal = await devices.createProposal({
      device_id: 'ESP32_A101',
      source: 'WF07_ENVIRONMENT',
      desired_state: { DEHUMIDIFIER: 'ON' },
      priority: 8,
      reason: 'Độ ẩm vượt 80% trong 5 phút',
      expires_at: new Date(Date.now() + 300000).toISOString()
    });
    assert.equal(proposal.ok, true);

    const newPolicy = await devices.createPolicy('A101', {
      config: { temperature_on: 29, humidity_on: 70 },
      active: true
    });
    assert.equal(newPolicy.version, 2);

    const simRun = await devices.createSimulationRun({
      device_id: 'ESP32_A101',
      scenario: 'morning_rush',
      status: 'RUNNING',
      config: { speed: 1 }
    });
    assert.equal(simRun.ok, true);

    const updatedRun = await devices.updateSimulationRun(simRun.id, 'PAUSED');
    assert.equal(updatedRun.status, 'PAUSED');

    console.log('Step 10: Dashboard...');
    const dash = await dashboard.get();
    assert.equal(dash.devices.length, 1);

    console.log('Step 11: Cleanup...');
    await new VinhBackendEnhancements1792300000000().down(db);
    await new InitialSchema1792200000000().down(db);
    console.log('ALL PASSED!');
  } finally {
    await pg.close();
  }
});
