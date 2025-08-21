import { randomUUID } from 'crypto';

export function interpolate(obj: any, ctx: { correlationId: string; workflowInstanceId: string; businessKey?: string; }, env: Record<string,string>) {
  const replacer = (s: string) => s.replace(/\$\{([^}]+)\}/g, (_, key) => {
    if (key === 'uuid') return randomUUID();
    if (key === 'now') return new Date().toISOString();
    if (key === 'user') return env.TEST_USER || env.USER || 'user';
    if (key === 'correlationId') return ctx.correlationId;
    if (key === 'workflowInstanceId') return ctx.workflowInstanceId;
    if (key === 'businessKey') return ctx.businessKey || '';
    if (key.startsWith('env:')) return env[key.slice(4)] || '';
    if (key.startsWith('ctx:')) {
      const parts = key.slice(4).split('.');
      const resolve = (root: any) => parts.reduce((acc, p) => (acc == null ? acc : acc[p]), root);
      // Prefer nested ctx bag if present, else fall back to top-level fields
      let v: any = resolve((ctx as any).ctx);
      if (v == null) v = resolve(ctx as any);
      return v == null ? '' : String(v);
    }
    return '';
  });
  const walk = (v: any): any => {
    if (typeof v === 'string') return replacer(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: any = {}; for (const k of Object.keys(v)) out[k] = walk(v[k]); return out;
    }
    return v;
  };
  return walk(obj);
}


