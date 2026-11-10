// Journal d'audit en ajout seul : qui a fait quoi sur l'argent ou l'identité.
export function createAudit({ db }) {
  return {
    async log({ actorId = null, actorType = 'user', action, entity, entityId, data }, trx = db) {
      await trx('audit_log').insert({
        actor_id: actorId,
        actor_type: actorType,
        action,
        entity,
        entity_id: String(entityId),
        data: data ? JSON.stringify(data) : null,
      });
    },
    async list({ entity, entityId, limit = 100 } = {}) {
      const q = db('audit_log').orderBy('id', 'desc').limit(Math.min(limit, 500));
      if (entity) q.where({ entity });
      if (entityId) q.where({ entity_id: String(entityId) });
      return (await q).map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null }));
    },
  };
}
