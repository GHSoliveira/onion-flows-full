import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(3),
});

export const userSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'AGENT', 'SUPER_ADMIN']),
  queues: z.array(z.string()).optional(),
  tenantId: z.string().optional(),
  permissions: z.array(z.string()).optional()
});

export const variableSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['text', 'number', 'boolean', 'json']),
  defaultValue: z.any().optional(),
  description: z.string().optional(),
  isRoot: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const flowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
});

export const templateSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
  scope: z.enum(['flow', 'root']).optional(),
  buttons: z.array(z.object({
    id: z.string(),
    label: z.string(),
    nextNodeId: z.string().optional()
  })).optional(),
});

const DayNames = z.enum(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']);

const scheduleRuleSchema = z.object({
  active: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm')
});

export const scheduleSchema = z.object({
  name: z.string().min(1),
  rules: z.record(DayNames, scheduleRuleSchema)
});

export const cannedResponseSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
  shortcut: z.string().optional(),
});

export const tagSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

export const webhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).optional(),
  secret: z.string().optional(),
});

export const queueSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

export const tenantSchema = z.object({
  name: z.string().min(1),
  plan: z.string().optional(),
});
