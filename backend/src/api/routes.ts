import { Router, type IRouter } from 'express';
import type { Response } from 'express';
import { getUserByKey } from '../config/config-loader.js';
import { generateToken } from '../auth/token-manager.js';
import { authMiddleware, type AuthenticatedRequest } from '../auth/middleware.js';
import type { AuthRequest, AuthResponse } from '../auth/types.js';
import type { CreateAgentRequest, UpdateAgentRequest, AgentResponse } from '../agents/types.js';
import { isValidActivity } from '../agents/state-mapper.js';
import {
  createAgent,
  updateAgentActivity,
  removeAgent,
  getAgent,
  getAgentsByOwner,
} from '../agents/agent-manager.js';

const router: IRouter = Router();

/**
 * POST /auth
 * Authenticates a user with an API key and returns a session token.
 */
router.post('/auth', (req, res: Response) => {
  const body = req.body as AuthRequest;

  if (!body.apiKey || typeof body.apiKey !== 'string') {
    res.status(400).json({ error: 'apiKey is required' });
    return;
  }

  const user = getUserByKey(body.apiKey);

  if (!user) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  const token = generateToken({ key: user.key, displayName: user.displayName });

  const response: AuthResponse = {
    token: token.token,
    displayName: user.displayName,
    expiresAt: new Date(token.expiresAt).toISOString(),
  };

  res.status(200).json(response);
});

/**
 * POST /agents
 * Creates a new agent. Requires authentication.
 */
router.post('/agents', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const body = req.body as CreateAgentRequest;

  // Validate required fields
  if (!body.id || typeof body.id !== 'string') {
    res.status(400).json({ error: 'id is required and must be a string' });
    return;
  }

  if (!body.displayName || typeof body.displayName !== 'string') {
    res.status(400).json({ error: 'displayName is required and must be a string' });
    return;
  }

  if (!body.activity || typeof body.activity !== 'string') {
    res.status(400).json({ error: 'activity is required and must be a string' });
    return;
  }

  if (!isValidActivity(body.activity)) {
    res.status(400).json({
      error: 'Invalid activity. Valid values: thinking, working, coding, reading, writing, done, idle, waiting, paused, leaving, offline, disconnected'
    });
    return;
  }

  // Validate optional variantIndex
  if (body.variantIndex !== undefined && (typeof body.variantIndex !== 'number' || body.variantIndex < 0)) {
    res.status(400).json({ error: 'variantIndex must be a non-negative number' });
    return;
  }

  const agent = createAgent(
    body.id,
    body.displayName,
    body.activity,
    user.key,
    user.displayName,
    body.variantIndex
  );

  if (!agent) {
    res.status(409).json({ error: 'Agent with this ID already exists' });
    return;
  }

  const response: AgentResponse = {
    id: agent.id,
    displayName: agent.displayName,
    variantIndex: agent.variantIndex,
    activity: agent.activity,
    state: agent.state,
    userName: agent.ownerDisplayName,
  };

  res.status(201).json(response);
});

/**
 * PUT /agents/:id
 * Updates an agent's activity. Requires authentication.
 */
router.put('/agents/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const body = req.body as UpdateAgentRequest;

  // Check if agent exists first
  const existingAgent = getAgent(id);
  if (!existingAgent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  // Check ownership
  if (existingAgent.ownerKey !== user.key) {
    res.status(403).json({ error: 'You do not own this agent' });
    return;
  }

  // Validate activity
  if (!body.activity || typeof body.activity !== 'string') {
    res.status(400).json({ error: 'activity is required and must be a string' });
    return;
  }

  if (!isValidActivity(body.activity)) {
    res.status(400).json({
      error: 'Invalid activity. Valid values: thinking, working, coding, reading, writing, done, idle, waiting, paused, leaving, offline, disconnected'
    });
    return;
  }

  const agent = updateAgentActivity(id, body.activity, user.key);

  if (!agent) {
    res.status(500).json({ error: 'Failed to update agent' });
    return;
  }

  const response: AgentResponse = {
    id: agent.id,
    displayName: agent.displayName,
    variantIndex: agent.variantIndex,
    activity: agent.activity,
    state: agent.state,
    userName: agent.ownerDisplayName,
  };

  res.status(200).json(response);
});

/**
 * DELETE /agents/:id
 * Removes an agent (sends them to exit). Requires authentication.
 */
router.delete('/agents/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  // Check if agent exists first
  const existingAgent = getAgent(id);
  if (!existingAgent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  // Check ownership
  if (existingAgent.ownerKey !== user.key) {
    res.status(403).json({ error: 'You do not own this agent' });
    return;
  }

  const agent = removeAgent(id, user.key);

  if (!agent) {
    res.status(500).json({ error: 'Failed to remove agent' });
    return;
  }

  res.status(200).json({ message: 'Agent removal initiated', id: agent.id });
});

/**
 * GET /agents
 * Gets all agents owned by the authenticated user.
 */
router.get('/agents', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const agents = getAgentsByOwner(user.key);

  const response: AgentResponse[] = agents.map((agent) => ({
    id: agent.id,
    displayName: agent.displayName,
    variantIndex: agent.variantIndex,
    activity: agent.activity,
    state: agent.state,
    userName: agent.ownerDisplayName,
  }));

  res.status(200).json(response);
});

/**
 * GET /agents/:id
 * Gets a specific agent by ID. Requires authentication.
 */
router.get('/agents/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const agent = getAgent(id);

  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  // Only allow viewing own agents
  if (agent.ownerKey !== user.key) {
    res.status(403).json({ error: 'You do not own this agent' });
    return;
  }

  const response: AgentResponse = {
    id: agent.id,
    displayName: agent.displayName,
    variantIndex: agent.variantIndex,
    activity: agent.activity,
    state: agent.state,
    userName: agent.ownerDisplayName,
  };

  res.status(200).json(response);
});

export default router;
