import { DurableObject } from 'cloudflare:workers';
import { Storage } from '@cloudflare/actors/storage';
import { getRequestId, initLogger, debug, error as logError } from '../../../utils/logger.js';
import { errorResponse } from '../../../atoms/http/httpAtoms.js';
import { ensureUserDoSchema } from '../../../atoms/userSql/userSqlAtoms.js';
import { handle as handleUserEntryRequest } from '../../../orchestration/commander/userEntryCommander.js';
import { createRuntimeServices } from '../runtime/createRuntimeServices.js';


export class UserDO extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.state = state;
        this.env = env;
        this.storage = new Storage(state.storage);
        this.runtimeServices = createRuntimeServices({ storage: this.storage, env, entry: 'user' });

        // schema 初始化下沉到 atom，避免在入口文件中散落 SQL
        ensureUserDoSchema(state.storage.sql, this.storage);
    }

    async fetch(request) {
        initLogger(this.env);
        const requestId = getRequestId(request);
        const url = new URL(request.url);
        debug(`[UserDO] [${requestId}] ${request.method} ${url.pathname}`);

        try {
            return await handleUserEntryRequest({
                request,
                env: this.env,
                state: this.state,
                storage: this.storage,
                requestId,
                services: this.runtimeServices,
            });
        } catch (err) {
            logError(`[UserDO] [${requestId}] unhandled error:`, err?.stack || err?.message || err);
            return errorResponse('Internal Server Error', 500);
        }
    }
}
