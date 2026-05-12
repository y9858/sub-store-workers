import { DurableObject } from 'cloudflare:workers';
import { Storage } from '@cloudflare/actors/storage';
import { getRequestId, initLogger, debug, error as logError } from '../../../utils/logger.js';
import { errorResponse } from '../../../atoms/http/httpAtoms.js';
import { handle as handleIndexEntryRequest } from '../../../orchestration/commander/indexEntryCommander.js';
import { createRuntimeServices } from '../runtime/createRuntimeServices.js';
import { ensureIndexSchema } from '../../../atoms/indexSql/ensureIndexSchema.js';

/**
 * IndexDO（全局 Durable Object）
 */
export class IndexDO extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.state = state;
        this.env = env;
        this.storage = new Storage(state.storage);
        this.runtimeServices = createRuntimeServices({ storage: this.storage, env, entry: 'index' });
        ensureIndexSchema(state.storage.sql, this.storage);
    }

    async fetch(request) {
        // Durable Object 是独立 isolate，需要在 DO 内部也初始化 logger
        initLogger(this.env);

        const requestId = getRequestId(request);
        const url = new URL(request.url);
        debug(`[IndexDO] [${requestId}] ${request.method} ${url.pathname}`);

        try {
            return await handleIndexEntryRequest({
                request,
                env: this.env,
                storage: this.storage,
                requestId,
                services: this.runtimeServices,
            });
        } catch (err) {
            logError(`[IndexDO] [${requestId}] unhandled error:`, err?.stack || err?.message || err);
            return errorResponse('Internal Server Error', 500);
        }
    }
}
