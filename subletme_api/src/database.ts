import { Pool, PoolClient, QueryResult } from 'pg';
import Logger from './utils/logger';

const { DB_USER, DB_HOST, DB_PASSWORD, DB_PORT, DB_NAME } = process.env;

// Create a single shared pool instance
const pool: Pool = new Pool({
    host: DB_HOST,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    port: parseInt(DB_PORT as string, 10),
    max: 20, // Maximum connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 10000,
});

export class Client {
    private client: PoolClient | null = null;
    private context: string;
    private inTransaction: boolean = false;

    constructor() {
        this.context = 'Client';
        Logger.log(`Initializing database client`, this.context);
    }

    public async connect(): Promise<void> {
        if (!this.client) {
            this.client = await pool.connect();
        }
    }

    public async beginTransaction(): Promise<void> {
        // Get a fresh connection for each transaction
        if (this.client) {
            this.client.release();
            this.client = null;
        }

        await this.connect();
        await this.query('BEGIN');
        this.inTransaction = true;
    }

    public async commit(): Promise<void> {
        if (!this.inTransaction) {
            throw new Error('No active transaction to commit');
        }
        await this.query('COMMIT');
        this.inTransaction = false;
    }

    public async rollback(): Promise<void> {
        if (!this.inTransaction) {
            throw new Error('No active transaction to rollback');
        }
        await this.query('ROLLBACK');
        this.inTransaction = false;
    }

    public async release(): Promise<void> {
        if (this.client) {
            // If still in transaction, rollback first
            if (this.inTransaction) {
                try {
                    await this.rollback();
                } catch (error) {
                    Logger.error(
                        'Error during rollback in release',
                        this.context,
                        error,
                    );
                }
            }
            this.client.release();
            this.client = null;
        }
    }

    public async query(
        queryText: string,
        params?: any[],
    ): Promise<QueryResult<any>> {
        const methodContext = this.context + ' - query';
        await this.connect();

        Logger.log(
            `Executing query: ${queryText} with params`,
            methodContext,
            params,
        );

        if (!this.client) {
            throw new Error('No database connection');
        }

        return this.client.query(queryText, params);
    }
}
