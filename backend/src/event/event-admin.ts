import type { Request, Response } from 'express';
import { getConfig } from '../config/config-loader.js';
import { getAllAgents, removeAgent } from '../agents/agent-manager.js';

/**
 * Handles DELETE /event/flush - removes all anonymous (event) agents.
 * Requires header `X-Event-Admin` matching the configured admin token.
 */
export function handleEventFlush(req: Request, res: Response): void {
  const config = getConfig();
  const eventMode = config.eventMode;

  if (!eventMode?.enabled) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const adminToken = eventMode.adminToken;
  if (!adminToken) {
    res.status(501).json({ error: 'Event admin token not configured' });
    return;
  }

  const provided = req.headers['x-event-admin'];
  if (typeof provided !== 'string' || provided !== adminToken) {
    res.status(401).json({ error: 'Invalid admin token' });
    return;
  }

  const anonymousAgents = getAllAgents().filter((a) => a.ownerKey.startsWith('anon-'));
  let removed = 0;
  for (const agent of anonymousAgents) {
    const result = removeAgent(agent.id, agent.ownerKey);
    if (result) removed++;
  }

  console.log(`[EventAdmin] Flushed ${removed} anonymous agent(s)`);
  res.status(200).json({ removed });
}
