import { getRequestId, initLogger, debug, error as logError } from '../../utils/logger.js';
import { errorResponse } from '../../atoms/http/httpAtoms.js';
import { handle as handleIndexEntryRequest } from '../../orchestration/commander/indexEntryCommander.js';
import { ensureIndexPgSchema } from './runtime/postgres/ensurePgSchema.js';
import { createDenoAppContext } from './runtime/context/createDenoAppContext.js';
import { createRuntimeServices } from './runtime/createRuntimeServices.js';

export async function createIndexEntryContext({ env, pool, now }) {
    await ensureIndexPgSchema(pool);
    const appContext = createDenoAppContext({ pool, now });
    return {
        env,
        pool,
        services: appContext.services,
        userDataStore: appContext.userDataStore,
    };
}

export async function handleIndexEntry({ request, env, pool, services }) {
    initLogger(env);
    const requestId = getRequestId(request);
    const url = new URL(request.url);
    debug(`[DenoIndex] [${requestId}] ${request.method} ${url.pathname}`);

    try {
        return await handleIndexEntryRequest({
            request,
            env,
            storage: null,
            requestId,
            services: services || createRuntimeServices({ pool }),
        });
    } catch (err) {
        logError(`[DenoIndex] [${requestId}] unhandled error:`, err?.stack || err?.message || err);
        return errorResponse('Internal Server Error', 500);
    }
}
