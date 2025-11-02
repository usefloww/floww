// Floww Docker Runtime HTTP Server
// Provides /health and /execute endpoints for container-based workflow execution

import Fastify from 'fastify';

const fastify = Fastify({
    logger: true
});

/**
 * Create wrapped project with auto-registration support
 * Injects provider configs and wrapper code to extract registered triggers
 */
function createWrappedProject(
    files: Record<string, string>,
    entrypoint: string,
    providerConfigs: Record<string, any> = {}
) {
    const [fileAndExport] = entrypoint.includes(".")
        ? entrypoint.split(".", 2)
        : [entrypoint, "default"];

    const wrapperCode = `
        const {
            getUsedProviders,
            getRegisteredTriggers,
            clearRegisteredTriggers,
            clearUsedProviders,
            setProviderConfigs
        } = require('floww');

        clearRegisteredTriggers();
        clearUsedProviders();

        const __providerConfigs__ = ${JSON.stringify(providerConfigs)};
        setProviderConfigs(__providerConfigs__);

        const originalModule = require('./${fileAndExport.replace(".ts", "")}');

        const usedProviders = getUsedProviders();
        const registeredTriggers = getRegisteredTriggers();

        module.exports = registeredTriggers;
        module.exports.default = registeredTriggers;
        module.exports.triggers = registeredTriggers;
        module.exports.providers = usedProviders;
        module.exports.originalResult = originalModule;
    `;

    return {
        files: {
            ...files,
            "__wrapper__.js": wrapperCode,
        },
        entryPoint: "__wrapper__",
    };
}

// Health check endpoint
fastify.get('/health', async (request, reply) => {
    return { status: 'ok' };
});

// Main execution endpoint
fastify.post('/execute', async (request, reply) => {
    try {
        const event = request.body as any;

        // Import FlowEngine and code execution utilities
        const { executeUserProject } = await import('floww');

        console.log('🚀 Floww Docker Runtime - Processing event');

        // Extract user code from the event
        if (!event.userCode) {
            reply.code(400);
            return {
                error: 'Bad Request',
                message: 'No userCode provided in event payload'
            };
        }

        // Get entrypoint from environment or default
        const entrypoint = process.env.FLOWW_ENTRYPOINT || 'main.ts';

        console.log(`📂 Loading entrypoint: ${entrypoint}`);

        // Extract provider configs from event (if provided)
        const providerConfigs = event.providerConfigs || {};

        // Create wrapped project with auto-registration support
        const wrappedProject = createWrappedProject(
            event.userCode,
            entrypoint,
            providerConfigs
        );

        // Execute wrapped project
        const module = await executeUserProject(wrappedProject);
        const triggers = module.triggers || module.default || [];

        if (!Array.isArray(triggers) || triggers.length === 0) {
            reply.code(400);
            return {
                error: 'Bad Request',
                message: 'No triggers were auto-registered. Make sure you are creating triggers using builtin.triggers.onWebhook() or similar methods.'
            };
        }

        console.log(`✅ Loaded ${triggers.length} trigger(s)`);

        // Route the event to appropriate triggers based on event type
        // Match ALL triggers with matching properties (handles duplicates correctly)
        let executedCount = 0;

        if (event.triggerType === 'cron') {
            // Handle cron trigger - match by expression
            const cronTriggers = triggers.filter(t => t.type === 'cron' && t.expression === event.expression);
            for (const trigger of cronTriggers) {
                console.log(`⏰ Executing cron trigger: ${trigger.expression}`);
                await trigger.handler({}, {
                    scheduledTime: event.scheduledTime || new Date().toISOString(),
                    expression: event.expression
                });
                executedCount++;
            }
        } else if (event.triggerType === 'webhook') {
            // Handle webhook trigger - match by path and method
            const webhookTriggers = triggers.filter(t => {
                if (t.type !== 'webhook') return false;
                const triggerPath = t.path || '/webhook';
                const triggerMethod = t.method || 'POST';
                return event.path === triggerPath && event.method === triggerMethod;
            });

            for (const trigger of webhookTriggers) {
                const triggerPath = trigger.path || '/webhook';
                const triggerMethod = trigger.method || 'POST';
                console.log(`🌐 Executing webhook trigger: ${triggerMethod} ${triggerPath}`);
                await trigger.handler({}, {
                    method: event.method,
                    path: event.path,
                    headers: event.headers || {},
                    body: event.body,
                    query: event.query || {}
                });
                executedCount++;
            }
        } else if (event.triggerType === 'realtime') {
            // Handle realtime trigger - match by channel
            const realtimeTriggers = triggers.filter(t => {
                if (t.type !== 'realtime') return false;
                return t.channel === event.channel &&
                    (!t.messageType || t.messageType === event.messageType);
            });

            for (const trigger of realtimeTriggers) {
                console.log(`📡 Executing realtime trigger: ${trigger.channel}`);
                await trigger.handler({}, {
                    channel: event.channel,
                    type: event.messageType,
                    data: event.data
                });
                executedCount++;
            }
        } else {
            console.log(`⚠️ Unknown trigger type: ${event.triggerType}`);
        }

        if (executedCount === 0) {
            console.log(`⚠️ No matching triggers found for ${event.triggerType}`);
        }

        return {
            statusCode: 200,
            message: 'Workflow executed successfully',
            triggersProcessed: triggers.length,
            triggersExecuted: executedCount
        };

    } catch (error: any) {
        console.error('❌ Execution failed:', error);

        reply.code(500);
        return {
            error: 'Internal Server Error',
            message: error.message
        };
    }
});

// Start server
const start = async () => {
    try {
        const port = parseInt(process.env.PORT || '8000');
        const host = process.env.HOST || '0.0.0.0';

        await fastify.listen({ port, host });

        console.log('🚀 Floww Docker Runtime Server started');
        console.log(`   Listening on ${host}:${port}`);
        console.log(`   Health: http://${host}:${port}/health`);
        console.log(`   Execute: http://${host}:${port}/execute`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
