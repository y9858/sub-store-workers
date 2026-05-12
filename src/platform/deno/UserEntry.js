import { getRequestId, initLogger, debug, error as logError } from '../../utils/logger.js';
import { errorResponse } from '../../atoms/http/httpAtoms.js';
import { handle as handleUserEntryRequest } from '../../orchestration/commander/userEntryCommander.js';
import { createRuntimeServices } from './runtime/createRuntimeServices.js';
import { ensureUserPgSchema } from './runtime/postgres/ensurePgSchema.js';

export async function createUserEntryContext({ env, pool, now }) {
    await ensureUserPgSchema(pool);
    return {
        env,
        pool,
        services: createRuntimeServices({ pool, now }),
    };
}

export async function handleUserEntry({ request, env, pool, services }) {
    initLogger(env);
    const requestId = getRequestId(request);
    const url = new URL(request.url);
    debug(`[DenoUser] [${requestId}] ${request.method} ${url.pathname}`);

    try {
        return await handleUserEntryRequest({
            request,
            env,
            state: null,
            storage: null,
            requestId,
            services: services || createRuntimeServices({ pool }),
        });
    } catch (err) {
        logError(`[DenoUser] [${requestId}] unhandled error:`, err?.stack || err?.message || err);
        return errorResponse('Internal Server Error', 500);
    }
}
