import 'dotenv/config';

export const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
export const taskQueue = process.env.TEMPORAL_TASK_QUEUE || 'district-workflow';
export const connectionOptions = {
  address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  tls: process.env.TEMPORAL_TLS === 'true' || Boolean(process.env.TEMPORAL_API_KEY),
  apiKey: process.env.TEMPORAL_API_KEY || undefined,
};
