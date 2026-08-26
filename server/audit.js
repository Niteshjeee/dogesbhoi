export async function audit(env, actor, action, targetType = '', targetId = '', detail = '') {
  if (!env.DB || !actor?.id) return;
  try {
    await env.DB.prepare(`
      INSERT INTO admin_audit(id,actor_admin_id,action,target_type,target_id,detail,created_at)
      VALUES(?,?,?,?,?,?,?)
    `).bind(
      `AUD-${crypto.randomUUID()}`,
      actor.id,
      String(action).slice(0, 80),
      String(targetType).slice(0, 40),
      String(targetId).slice(0, 100),
      String(detail).slice(0, 250),
      Date.now()
    ).run();
  } catch {
    // Audit failure must not break the requested admin action.
  }
}
