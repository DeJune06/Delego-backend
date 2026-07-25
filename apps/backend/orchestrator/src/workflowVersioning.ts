/**
 * Workflow Versioning and Migration Support
 * Tags workflows with versions at creation time and ensures in-flight workflows
 * continue on their original version while providing migration paths.
 */
import { createLogger } from "@delego/utils";
import { Pool } from "pg";

const log = createLogger("orchestrator:workflow-versioning", process.env.LOG_LEVEL ?? "info");

export interface WorkflowVersion {
    version: number;
    name: string;
    definition: Record<string, unknown>;
    createdAt: string;
    deprecatedAt?: string;
}

export interface VersionedWorkflow {
    id: string;
    orderId: string;
    version: number;
    state: string;
    context: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

interface WorkflowRow {
    id: string;
    order_id: string;
    version: number;
    state: string;
    context: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
}

interface WorkflowVersionRow {
    version: number;
    name: string;
    definition: Record<string, unknown>;
    created_at: Date;
    deprecated_at: Date | null;
}

function getPool(): Pool {
    const databaseUrl =
        process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";
    return new Pool({ connectionString: databaseUrl });
}

/**
 * Registers a new workflow version or definition.
 * Versions are immutable once created.
 */
export async function registerWorkflowVersion(
    version: number,
    name: string,
    definition: Record<string, unknown>
): Promise<WorkflowVersion> {
    if (version <= 0 || !Number.isInteger(version)) {
        throw new Error(`Version must be a positive integer, got ${version}`);
    }

    if (!name || !definition) {
        throw new Error("Workflow name and definition are required");
    }

    const pool = getPool();

    try {
        // Check if version already exists
        const { rows: existingRows } = await pool.query<WorkflowVersionRow>(
            `SELECT * FROM workflow_versions WHERE version = $1`,
            [version]
        );

        if (existingRows.length > 0) {
            throw new Error(`Workflow version ${version} already registered`);
        }

        const { rows } = await pool.query<WorkflowVersionRow>(
            `INSERT INTO workflow_versions (version, name, definition, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING version, name, definition, created_at, deprecated_at`,
            [version, name, JSON.stringify(definition)]
        );

        const row = rows[0];
        const result: WorkflowVersion = {
            version: row.version,
            name: row.name,
            definition: row.definition,
            createdAt: row.created_at.toISOString(),
            deprecatedAt: row.deprecated_at?.toISOString(),
        };

        log.info("Workflow version registered", { version, name });
        return result;
    } catch (err) {
        log.error("Failed to register workflow version", {
            version,
            error: (err as Error).message,
        });
        throw err;
    }
}

/**
 * Retrieves a specific workflow version definition.
 */
export async function getWorkflowVersion(version: number): Promise<WorkflowVersion | null> {
    const pool = getPool();

    try {
        const { rows } = await pool.query<WorkflowVersionRow>(
            `SELECT version, name, definition, created_at, deprecated_at
       FROM workflow_versions
       WHERE version = $1`,
            [version]
        );

        if (!rows[0]) {
            return null;
        }

        const row = rows[0];
        return {
            version: row.version,
            name: row.name,
            definition: row.definition,
            createdAt: row.created_at.toISOString(),
            deprecatedAt: row.deprecated_at?.toISOString(),
        };
    } catch (err) {
        log.error("Failed to fetch workflow version", { version, error: (err as Error).message });
        throw err;
    }
}

/**
 * Gets the latest available workflow version.
 * Used as fallback when unknown versions are encountered.
 */
export async function getLatestWorkflowVersion(): Promise<WorkflowVersion | null> {
    const pool = getPool();

    try {
        const { rows } = await pool.query<WorkflowVersionRow>(
            `SELECT version, name, definition, created_at, deprecated_at
       FROM workflow_versions
       WHERE deprecated_at IS NULL
       ORDER BY version DESC
       LIMIT 1`,
            []
        );

        if (!rows[0]) {
            return null;
        }

        const row = rows[0];
        return {
            version: row.version,
            name: row.name,
            definition: row.definition,
            createdAt: row.created_at.toISOString(),
            deprecatedAt: row.deprecated_at?.toISOString(),
        };
    } catch (err) {
        log.error("Failed to fetch latest workflow version", { error: (err as Error).message });
        throw err;
    }
}

/**
 * Creates a new workflow tagged with the current version.
 */
export async function createVersionedWorkflow(
    orderId: string,
    version: number,
    initialState: string,
    context: Record<string, unknown>
): Promise<VersionedWorkflow> {
    if (!orderId || version <= 0) {
        throw new Error("orderId and version are required");
    }

    const pool = getPool();

    try {
        // Verify version exists
        const versionDef = await getWorkflowVersion(version);
        if (!versionDef) {
            throw new Error(`Workflow version ${version} not found`);
        }

        const workflowId = generateWorkflowId();
        const now = new Date();

        const { rows } = await pool.query<WorkflowRow>(
            `INSERT INTO purchase_workflows (id, order_id, version, state, context, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, order_id, version, state, context, created_at, updated_at`,
            [workflowId, orderId, version, initialState, JSON.stringify(context), now, now]
        );

        const row = rows[0];
        const result: VersionedWorkflow = {
            id: row.id,
            orderId: row.order_id,
            version: row.version,
            state: row.state,
            context: row.context,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
        };

        log.info("Versioned workflow created", { workflowId, orderId, version });
        return result;
    } catch (err) {
        log.error("Failed to create versioned workflow", {
            orderId,
            version,
            error: (err as Error).message,
        });
        throw err;
    }
}

/**
 * Retrieves a workflow with its version information.
 */
export async function getVersionedWorkflow(workflowId: string): Promise<VersionedWorkflow | null> {
    const pool = getPool();

    try {
        const { rows } = await pool.query<WorkflowRow>(
            `SELECT id, order_id, version, state, context, created_at, updated_at
       FROM purchase_workflows
       WHERE id = $1`,
            [workflowId]
        );

        if (!rows[0]) {
            return null;
        }

        const row = rows[0];
        return {
            id: row.id,
            orderId: row.order_id,
            version: row.version,
            state: row.state,
            context: row.context,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
        };
    } catch (err) {
        log.error("Failed to fetch versioned workflow", {
            workflowId,
            error: (err as Error).message,
        });
        throw err;
    }
}

/**
 * Transitions a workflow state while preserving its version.
 * Version is immutable throughout the workflow lifecycle.
 */
export async function transitionVersionedWorkflow(
    workflowId: string,
    newState: string,
    contextUpdate?: Record<string, unknown>
): Promise<VersionedWorkflow> {
    const pool = getPool();

    try {
        const existing = await getVersionedWorkflow(workflowId);
        if (!existing) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        const updatedContext = contextUpdate ? { ...existing.context, ...contextUpdate } : existing.context;

        const { rows } = await pool.query<WorkflowRow>(
            `UPDATE purchase_workflows
       SET state = $1, context = $2, updated_at = NOW()
       WHERE id = $3 AND version = $4
       RETURNING id, order_id, version, state, context, created_at, updated_at`,
            [newState, JSON.stringify(updatedContext), workflowId, existing.version]
        );

        if (!rows[0]) {
            throw new Error(`Failed to transition workflow ${workflowId}`);
        }

        const row = rows[0];
        const result: VersionedWorkflow = {
            id: row.id,
            orderId: row.order_id,
            version: row.version,
            state: row.state,
            context: row.context,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
        };

        log.info("Workflow transitioned", {
            workflowId,
            version: existing.version,
            newState,
        });

        return result;
    } catch (err) {
        log.error("Failed to transition versioned workflow", {
            workflowId,
            error: (err as Error).message,
        });
        throw err;
    }
}

/**
 * Migrates a completed workflow to a new version.
 * Used for re-processing or retrying workflows with updated logic.
 * Preserves core state and context while updating to new version definition.
 */
export async function migrateWorkflowVersion(
    workflowId: string,
    targetVersion: number
): Promise<VersionedWorkflow> {
    const pool = getPool();

    try {
        const existing = await getVersionedWorkflow(workflowId);
        if (!existing) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        // Verify target version exists
        const targetDef = await getWorkflowVersion(targetVersion);
        if (!targetDef) {
            throw new Error(`Target workflow version ${targetVersion} not found`);
        }

        // Only allow migration from completed workflows
        if (existing.state !== "COMPLETED" && existing.state !== "FAILED" && existing.state !== "CANCELLED") {
            throw new Error(
                `Cannot migrate workflow in ${existing.state} state; must be terminal (COMPLETED, FAILED, or CANCELLED)`
            );
        }

        const { rows } = await pool.query<WorkflowRow>(
            `UPDATE purchase_workflows
       SET version = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, order_id, version, state, context, created_at, updated_at`,
            [targetVersion, workflowId]
        );

        if (!rows[0]) {
            throw new Error(`Failed to migrate workflow ${workflowId}`);
        }

        const row = rows[0];
        const result: VersionedWorkflow = {
            id: row.id,
            orderId: row.order_id,
            version: row.version,
            state: row.state,
            context: row.context,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
        };

        log.info("Workflow migrated", {
            workflowId,
            fromVersion: existing.version,
            toVersion: targetVersion,
        });

        return result;
    } catch (err) {
        log.error("Failed to migrate workflow version", {
            workflowId,
            error: (err as Error).message,
        });
        throw err;
    }
}

/**
 * Deprecates a workflow version, preventing new workflows from using it.
 * Existing workflows continue on their original version.
 */
export async function deprecateWorkflowVersion(version: number): Promise<WorkflowVersion | null> {
    const pool = getPool();

    try {
        const { rows } = await pool.query<WorkflowVersionRow>(
            `UPDATE workflow_versions
       SET deprecated_at = NOW()
       WHERE version = $1
       RETURNING version, name, definition, created_at, deprecated_at`,
            [version]
        );

        if (!rows[0]) {
            return null;
        }

        const row = rows[0];
        const result: WorkflowVersion = {
            version: row.version,
            name: row.name,
            definition: row.definition,
            createdAt: row.created_at.toISOString(),
            deprecatedAt: row.deprecated_at?.toISOString(),
        };

        log.info("Workflow version deprecated", { version });
        return result;
    } catch (err) {
        log.error("Failed to deprecate workflow version", { version, error: (err as Error).message });
        throw err;
    }
}

function generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
